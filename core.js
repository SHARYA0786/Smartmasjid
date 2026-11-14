
      const { useState, useEffect, useMemo, useRef } = React;

      // GOOGLE FIREBASE CLOUD DATABASE (Permanent 24/7 Cloud Storage)
      const firebaseConfig = {
        apiKey: "AIzaSyDjEqIENseu6WzNWh6cIMlN_a3ywcYlw9E",
        authDomain: "masjidconnect-24fde.firebaseapp.com",
        projectId: "masjidconnect-24fde",
        storageBucket: "masjidconnect-24fde.firebasestorage.app",
        messagingSenderId: "439393157416",
        appId: "1:439393157416:web:47ceabcbbfee746257101d",
        measurementId: "G-24WKQRX2GT"
      };

      let firestoreDb = null;
      try {
        if (typeof firebase !== 'undefined') {
          if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
          }
          firestoreDb = firebase.firestore();
          try { firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch(e) {}
        }
      } catch (err) {
        console.warn('Firebase init warning:', err);
      }

      // GLOBAL REALTIME CLOUD NETWORK (v12 - Clears Old Corrupted Cache)
      const MQTT_PRIMARY_WS = 'wss://broker.emqx.io:8084/mqtt';
      const MQTT_TOPIC_VERSION = 'masjid_connect_v12_stable'; 
      
      const TOPIC_DB_PREFIX = `${MQTT_TOPIC_VERSION}/db/`; 
      const TOPIC_EVENTS = `${MQTT_TOPIC_VERSION}/events`;
      const TOPIC_LIVE_AZAN = `${MQTT_TOPIC_VERSION}/live_broadcast`;
      const TOPIC_AUDIO_PREFIX = `${MQTT_TOPIC_VERSION}/audio/`;
      const TOPIC_ADMIN_SETTINGS = `${TOPIC_DB_PREFIX}admin_settings`;

      const LIVE_STALE_MS = 45000; // itne waqt tak heartbeat na aaye to live band maana jayega
      const myClientId = 'mc_u_' + Math.random().toString(36).substring(2, 9);
      let mqttClient = null;

      try {
        if (typeof mqtt !== 'undefined') {
          mqttClient = mqtt.connect(MQTT_PRIMARY_WS, { clientId: myClientId, clean: true, keepalive: 30, reconnectPeriod: 2000 });
        }
      } catch (err) {}

      // SAFE LOCAL STORAGE HELPER
      const safeStorageSet = (key, value) => { try { localStorage.setItem(key, value); } catch(e) {} };
      const safeStorageGet = (key, fallback = null) => { try { return localStorage.getItem(key) || fallback; } catch(e) { return fallback; } };

      // REAL-TIME AUDIO ENGINE
      class LiveAzanStreamer {
        constructor() { this.recordCtx = null; this.playCtx = null; this.micStream = null; this.processor = null; this.isBroadcasting = false; this.nextPlayTime = 0; this.masjidId = null; this.startedAt = 0; this.mediaEl = null; this.mediaDest = null; this.outNode = null; }
        initContext() {
          if (!this.playCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext; this.playCtx = new AudioCtx({ sampleRate: 16000 });
            // silent/mute switch ke bawajood awaaz: media-element se play (iPhone ka "playback" audio session)
            try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
            try { this.mediaDest = this.playCtx.createMediaStreamDestination(); this.mediaEl = new Audio(); this.mediaEl.setAttribute('playsinline', ''); this.mediaEl.srcObject = this.mediaDest.stream; } catch (e) { this.mediaEl = null; }
          }
          if (this.playCtx.state === 'suspended') this.playCtx.resume();
          if (this.mediaEl && this.mediaEl.paused) { try { const pr = this.mediaEl.play(); if (pr && pr.then) pr.then(() => { this.outNode = this.mediaDest; }).catch(() => { this.outNode = null; }); } catch (e) {} }
          return this.playCtx;
        }
        getOut(ctx) { return (this.outNode && this.mediaEl && !this.mediaEl.paused) ? this.outNode : ctx.destination; }
        async startBroadcast(masjidId) {
          try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { success: false, error: 'माइक उपलब्ध नहीं है।' };
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 }, video: false });
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.recordCtx = new AudioCtx({ sampleRate: 16000 });
            if (this.recordCtx.state === 'suspended') await this.recordCtx.resume();
            const source = this.recordCtx.createMediaStreamSource(this.micStream);
            this.processor = this.recordCtx.createScriptProcessor(2048, 1, 1);
            this.processor.onaudioprocess = (e) => {
              if (!this.isBroadcasting) return;
              const input = e.inputBuffer.getChannelData(0); const pcm16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) { const s = Math.max(-1, Math.min(1, input[i])); pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
              const u8 = new Uint8Array(pcm16.buffer); let binary = ''; for (let i = 0; i < u8.byteLength; i++) binary += String.fromCharCode(u8[i]);
              if (mqttClient && mqttClient.connected) mqttClient.publish(TOPIC_AUDIO_PREFIX + masjidId, btoa(binary), { qos: 0 });
            };
            source.connect(this.processor); this.processor.connect(this.recordCtx.destination); this.masjidId = masjidId; this.startedAt = Date.now(); this.isBroadcasting = true;
            if (mqttClient && mqttClient.connected) mqttClient.publish(TOPIC_LIVE_AZAN, JSON.stringify({ isLive: true, masjidId, startedAt: this.startedAt, ts: Date.now() }), { retain: true, qos: 1 });
            return { success: true };
          } catch (err) { return { success: false, error: 'माइक की अनुमति दें।' }; }
        }
        stopBroadcast(masjidId) {
          this.isBroadcasting = false;
          if (this.processor) { try { this.processor.disconnect(); } catch(e){} this.processor = null; }
          if (this.recordCtx) { try { this.recordCtx.close(); } catch(e){} this.recordCtx = null; }
          if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
          if (mqttClient && mqttClient.connected) mqttClient.publish(TOPIC_LIVE_AZAN, JSON.stringify({ isLive: false, masjidId, stoppedAt: Date.now(), ts: Date.now() }), { retain: true, qos: 1 });
        }
        heartbeat(masjidId) {
          if (this.isBroadcasting && mqttClient && mqttClient.connected) mqttClient.publish(TOPIC_LIVE_AZAN, JSON.stringify({ isLive: true, masjidId, startedAt: this.startedAt, ts: Date.now() }), { retain: true, qos: 1 });
        }
        playLiveVoicePacket(base64Data, volume = 1.0) {
          try {
            const ctx = this.initContext(); const binary = atob(base64Data); const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const int16 = new Int16Array(bytes.buffer); const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
            const audioBuf = ctx.createBuffer(1, float32.length, 16000); audioBuf.copyToChannel(float32, 0);
            const source = ctx.createBufferSource(); source.buffer = audioBuf;
            const gainNode = ctx.createGain(); gainNode.gain.value = Math.max(0.3, Math.min(2.5, volume * 1.8));
            source.connect(gainNode); gainNode.connect(this.getOut(ctx));
            const now = ctx.currentTime; if (!this.nextPlayTime || this.nextPlayTime < now) this.nextPlayTime = now + 0.04;
            source.start(this.nextPlayTime); this.nextPlayTime += audioBuf.duration;
          } catch(e) {}
        }
        playMelodicAlarm() {
          try {
            const ctx = this.initContext(); const notes = [293.66, 369.99, 440.00, 369.99, 329.63, 293.66];
            notes.forEach((freq, idx) => {
              const osc = ctx.createOscillator(); const gain = ctx.createGain();
              osc.type = 'sine'; osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.35);
              gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.35);
              gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + idx * 0.35 + 0.05);
              gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.35 + 0.45);
              osc.connect(gain); gain.connect(this.getOut(ctx)); osc.start(ctx.currentTime + idx * 0.35); osc.stop(ctx.currentTime + idx * 0.35 + 0.5);
            });
          } catch(e) {}
        }
      }
      const azanStreamer = new LiveAzanStreamer();

      function calculateDistanceKm(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371; const dLat = ((lat2 - lat1) * Math.PI) / 180; const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      // ----------------------------------------------------
      // HELPERS: photo compress, time format, hijri
      // ----------------------------------------------------
      const compressImageFile = (file, maxDim = 480, quality = 0.72) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (ev) => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale)); const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });

      const INDIA_STATE_DISTRICTS = {
        'Uttar Pradesh': ['Mau', 'Ballia', 'Azamgarh', 'Ghazipur', 'Varanasi', 'Gorakhpur', 'Jaunpur', 'Deoria', 'Basti', 'Sant Kabir Nagar', 'Lucknow', 'Kanpur', 'Prayagraj', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Muzaffarnagar', 'Rampur', 'Sambhal', 'Bijnor', 'Agra', 'Ayodhya', 'Sultanpur', 'Pratapgarh', 'Gonda', 'Bahraich', 'Barabanki', 'Sitapur', 'Hardoi', 'Noida', 'Ghaziabad', 'Mathura', 'Firozabad', 'Jhansi', 'Mirzapur', 'Bhadohi', 'Kushinagar', 'Maharajganj', 'Siddharthnagar', 'Balrampur', 'Shravasti', 'Unnao', 'Rae Bareli', 'Amethi', 'Fatehpur', 'Kaushambi', 'Banda', 'Chitrakoot', 'Hamirpur', 'Mahoba', 'Jalaun', 'Lalitpur', 'Etawah', 'Mainpuri', 'Kannauj', 'Farrukhabad', 'Auraiya', 'Etah', 'Kasganj', 'Hathras', 'Bulandshahr', 'Hapur', 'Baghpat', 'Shamli', 'Amroha', 'Pilibhit', 'Shahjahanpur', 'Badaun', 'Lakhimpur Kheri', 'Sonbhadra', 'Chandauli'],
        'Bihar': ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur', 'Darbhanga', 'Madhubani', 'Samastipur', 'Purnia', 'Katihar', 'Kishanganj', 'Siwan', 'Gopalganj', 'Motihari', 'Bettiah', 'Arrah', 'Buxar', 'Rohtas', 'Nalanda', 'Begusarai', 'Saharsa', 'Supaul', 'Munger', 'Jamui', 'Khagaria', 'Madhepura', 'Araria', 'Sitamarhi', 'Sheohar', 'Vaishali', 'Saran', 'Nawada', 'Aurangabad', 'Jehanabad', 'Arwal', 'Kaimur', 'Banka', 'Lakhisarai', 'Sheikhpura'],
        'Delhi': ['Central Delhi', 'New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Shahdara', 'North East Delhi', 'North West Delhi', 'South East Delhi', 'South West Delhi'],
        'Maharashtra': ['Mumbai', 'Mumbai Suburban', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Amravati', 'Navi Mumbai', 'Kolhapur', 'Akola', 'Jalgaon', 'Latur', 'Dhule', 'Ahmednagar', 'Chandrapur', 'Parbhani', 'Jalna', 'Beed', 'Nanded', 'Satara', 'Raigad', 'Ratnagiri', 'Buldhana', 'Yavatmal', 'Palghar', 'Sangli'],
        'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Katni', 'Singrauli', 'Burhanpur', 'Khandwa', 'Bhind', 'Chhindwara', 'Guna', 'Shivpuri', 'Vidisha', 'Damoh', 'Mandsaur', 'Khargone', 'Neemuch'],
        'West Bengal': ['Kolkata', 'Howrah', 'North 24 Parganas', 'South 24 Parganas', 'Hooghly', 'Nadia', 'Murshidabad', 'Malda', 'Burdwan', 'Asansol', 'Durgapur', 'Siliguri', 'Darjeeling', 'Jalpaiguri', 'Birbhum', 'Bankura', 'Purulia', 'Midnapore'],
        'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur', 'Bhilwara', 'Alwar', 'Bharatpur', 'Sikar', 'Pali', 'Sri Ganganagar', 'Hanumangarh', 'Jhunjhunu', 'Baran', 'Chittorgarh', 'Tonk', 'Sawai Madhopur', 'Nagaur', 'Churu', 'Barmer', 'Jaisalmer'],
        'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Bharuch', 'Navsari', 'Valsad', 'Kutch', 'Mehsana', 'Patan', 'Morbi', 'Amreli', 'Porbandar'],
        'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet', 'Siddipet', 'Jagtial'],
        'Karnataka': ['Bengaluru', 'Mysuru', 'Hubballi', 'Belagavi', 'Mangaluru', 'Kalaburagi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga', 'Tumakuru', 'Raichur', 'Bidar', 'Udupi'],
        'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur', 'Vellore', 'Erode', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Kanchipuram'],
        'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Malappuram', 'Kollam', 'Thrissur', 'Kannur', 'Palakkad', 'Kasaragod', 'Alappuzha', 'Kottayam', 'Wayanad'],
        'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih', 'Ramgarh', 'Palamu', 'Dumka', 'Godda', 'Sahibganj', 'Pakur', 'Koderma', 'Chatra', 'Garhwa'],
        'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Pathankot', 'Moga', 'Batala', 'Malerkotla', 'Firozpur', 'Sangrur', 'Gurdaspur'],
        'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Sirsa', 'Bhiwani', 'Rewari'],
        'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Nainital', 'Rudrapur', 'Rishikesh', 'Almora', 'Pithoragarh', 'Chamoli', 'Udham Singh Nagar'],
        'Assam': ['Guwahati', 'Kamrup', 'Dibrugarh', 'Silchar', 'Nagaon', 'Barpeta', 'Dhubri', 'Cachar', 'Karimganj', 'Jorhat', 'Tinsukia', 'Bongaigaon'],
        'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore', 'Bhadrak', 'Angul', 'Jharsuguda'],
        'Jammu & Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Budgam', 'Pulwama', 'Kupwara', 'Kulgam', 'Kathua', 'Udhampur', 'Rajouri', 'Poonch', 'Doda'],
        'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Tirupati', 'Kadapa', 'Kakinada', 'Anantapur'],
        'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Jagdalpur', 'Raigarh', 'Ambikapur'],
        'Goa': ['North Goa', 'South Goa', 'Panaji', 'Margao'],
        'Himachal Pradesh': ['Shimla', 'Kangra', 'Mandi', 'Solan', 'Kullu', 'Chamba', 'Hamirpur', 'Una'],
        'Tripura': ['Agartala', 'Gomati', 'North Tripura', 'South Tripura', 'Dhalai', 'Unakoti'],
        'Manipur': ['Imphal', 'Thoubal', 'Churachandpur', 'Bishnupur'],
        'Meghalaya': ['Shillong', 'West Garo Hills', 'Jaintia Hills', 'Ri-Bhoi'],
        'Nagaland': ['Kohima', 'Dimapur', 'Mokokchung'],
        'Mizoram': ['Aizawl', 'Lunglei', 'Champhai'],
        'Sikkim': ['Gangtok', 'Namchi', 'Mangan', 'Geyzing'],
        'Arunachal Pradesh': ['Itanagar', 'Tawang', 'Pasighat'],
        'Chandigarh': ['Chandigarh'],
        'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
        'Ladakh': ['Leh', 'Kargil'],
        'Andaman & Nicobar Islands': ['Port Blair', 'South Andaman'],
        'Dadra & Nagar Haveli and Daman & Diu': ['Daman', 'Diu', 'Silvassa'],
        'Lakshadweep': ['Kavaratti']
      };
      const ALL_INDIA_STATES = Object.keys(INDIA_STATE_DISTRICTS).sort();

      const DEFAULT_SCHEDULE = { khatmSehri: '04:45', fajr: '05:20', fajrJamat: '05:45', sunrise: '06:40', zuhr: '12:35', zuhrJamat: '13:00', asr: '16:20', asrJamat: '16:45', sunset: '12:15', maghrib: '17:50', maghribJamat: '18:10', isha: '19:15', ishaJamat: '19:45', jumaAzan: '13:00', jumaJamat: '13:30' };
      const addMinutesToTime = (timeStr, minutesToAdd) => {
        if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return timeStr || '04:45';
        const [h, m] = timeStr.split(':').map(Number);
        let total = ((h || 0) * 60 + (m || 0) + minutesToAdd) % 1440;
        if (total < 0) total += 1440;
        const nh = Math.floor(total / 60);
        const nm = total % 60;
        return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      };
      const PM_KEYS = ['iftar', 'zuhr', 'zuhrJamat', 'asr', 'asrJamat', 'maghrib', 'maghribJamat', 'isha', 'ishaJamat', 'sunset', 'jumaAzan', 'jumaJamat'];
      // purana data "04:20" (12-ghante style) ho sakta hai: dopahar ke baad wali namaz ko 24-ghante me badalta hai
      const normTime = (key, v) => {
        if (!v || typeof v !== 'string') return '';
        const m = v.match(/^(\d{1,2}):(\d{2})/); if (!m) return v;
        let h = parseInt(m[1], 10); if (PM_KEYS.includes(key) && h < 12) h += 12;
        return `${String(h).padStart(2, '0')}:${m[2]}`;
      };
      const normSchedule = (s) => {
        const out = {};
        Object.keys(DEFAULT_SCHEDULE).forEach(k => {
          out[k] = normTime(k, (s && s[k]) || DEFAULT_SCHEDULE[k]);
        });
        if (!(s && s.khatmSehri)) {
          out.khatmSehri = addMinutesToTime(out.fajr || '05:20', -15);
        }
        return out;
      };
      const splitTime12 = (key, v, def) => {
        const n = normTime(key, v || def); const m = n.match(/^(\d{1,2}):(\d{2})/); if (!m) return { t: n, ap: '' };
        let h = parseInt(m[1], 10); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return { t: `${h}:${m[2]}`, ap };
      };
      const t12 = (key, v, def) => { const x = splitTime12(key, v, def); return `${x.t} ${x.ap}`.trim(); };
      const T = (sch, key, def) => { const x = splitTime12(key, sch && sch[key], def); return <>{x.t}<span className="text-[9px] font-bold ml-0.5">{x.ap}</span></>; };

      // ---- NAMAZ PROGRESS BAR HELPER & COMPONENT ----
      const getNamazProgressInfo = (schedule, now = new Date()) => {
        if (!schedule) return null;
        const sch = normSchedule(schedule);
        const parseMin = (str) => {
          if (!str) return 0;
          const m = String(str).match(/^(\d{1,2}):(\d{2})/);
          if (!m) return 0;
          return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        };

        const prayers = [
          { key: 'fajr', label: 'Fajr', timeStr: sch.fajr || '05:20', min: parseMin(sch.fajr || '05:20') },
          { key: 'zuhr', label: 'Zuhr', timeStr: sch.zuhr || '12:35', min: parseMin(sch.zuhr || '12:35') },
          { key: 'asr', label: 'Asr', timeStr: sch.asr || '16:20', min: parseMin(sch.asr || '16:20') },
          { key: 'maghrib', label: 'Maghrib', timeStr: sch.maghrib || '17:50', min: parseMin(sch.maghrib || '17:50') },
          { key: 'isha', label: 'Isha', timeStr: sch.isha || '19:15', min: parseMin(sch.isha || '19:15') }
        ];

        const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        let nextKey = 'fajr';
        let startMin = prayers[4].min - 1440;
        let endMin = prayers[0].min;

        if (nowMin < prayers[0].min) {
          nextKey = 'fajr';
          startMin = prayers[4].min - 1440;
          endMin = prayers[0].min;
        } else if (nowMin < prayers[1].min) {
          nextKey = 'zuhr';
          startMin = prayers[0].min;
          endMin = prayers[1].min;
        } else if (nowMin < prayers[2].min) {
          nextKey = 'asr';
          startMin = prayers[1].min;
          endMin = prayers[2].min;
        } else if (nowMin < prayers[3].min) {
          nextKey = 'maghrib';
          startMin = prayers[2].min;
          endMin = prayers[3].min;
        } else if (nowMin < prayers[4].min) {
          nextKey = 'isha';
          startMin = prayers[3].min;
          endMin = prayers[4].min;
        } else {
          nextKey = 'fajr';
          startMin = prayers[4].min;
          endMin = prayers[0].min + 1440;
        }

        const effectiveNow = (nowMin < prayers[0].min) ? nowMin : (nowMin >= prayers[4].min && endMin > 1440 ? nowMin : nowMin);
        const totalSpan = Math.max(1, endMin - startMin);
        const elapsed = Math.max(0, effectiveNow - startMin);
        const progress = Math.min(100, Math.max(0, Math.round((elapsed / totalSpan) * 100)));

        const remainingMin = Math.max(0, Math.round(endMin - effectiveNow));
        const remH = Math.floor(remainingMin / 60);
        const remM = remainingMin % 60;
        const remainStr = remH > 0 ? `${remH}h ${remM}m` : `${remM}m`;

        const nextPrayerObj = prayers.find(p => p.key === nextKey) || prayers[0];
        const nextTime12 = t12(nextKey, nextPrayerObj.timeStr);

        const enrichedPrayers = prayers.map(p => {
          const isPassed = nowMin >= p.min;
          const isNext = p.key === nextKey;
          return {
            ...p,
            time12: t12(p.key, p.timeStr),
            isPassed,
            isNext
          };
        });

        return {
          nextKey,
          nextName: nextPrayerObj.label,
          nextTime12,
          progress,
          remainStr,
          prayers: enrichedPrayers
        };
      };

      const NamazProgressBar = ({ schedule, currentTime, darkMode }) => {
        const info = getNamazProgressInfo(schedule, currentTime);
        if (!info) return null;
        return (
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl py-1.5 px-3 border shadow-xs space-y-1.5`}>
            {/* Header: Next Prayer name, time & Countdown */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Next:</span>
                <span className="font-extrabold text-xs text-emerald-800 dark:text-emerald-300 truncate">
                  {info.nextName} {info.nextTime12}
                </span>
              </div>
              <div className="flex items-center gap-1 font-mono font-black text-[10.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/40 shrink-0">
                <span>⏳</span>
                <span>{info.remainStr} left</span>
              </div>
            </div>

            {/* Dynamic Progress Line */}
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden p-[1px] border border-slate-200 dark:border-slate-600">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-teal-500 to-amber-400 transition-all duration-700 shadow-xs"
                style={{ width: `${info.progress}%` }}
              />
            </div>
          </div>
        );
      };

      // ==========================================================
      // ADMIN (APP BANANE WALE) KI JANKARI - yahin badlein
      // upiId khaali ("") ho to "सर्वर में मदद करें" card nahi dikhega
      // ==========================================================
      const DEFAULT_ADMIN_SUPPORT = {
        naam: 'Admin',            // App Administrator
        upiId: '8084329613@upi',  // Admin UPI: 8084329613@upi
        phone: '8084329613',      // Admin Phone: 8084329613
        whatsapp: '918084329613', // Admin WhatsApp: 8084329613
        email: '',           // jaise: 'you@gmail.com'
        qrPhoto: '',          // optional: apne QR ki photo ka data-URL ya link
        allMasjidsPaidMode: false, // agar true ho to bina payment/approval sabhi masjids ke profile buttons locked rahenge
        premiumFeeAmount: 499,
        supportMessage: 'यह ऐप अल्हम्दुलिल्लाह सभी मस्जिदों और मुक़्तदियों के लिए 100% मुफ़्त है। सर्वर, डेटाबेस व मैसेजिंग का मासिक खर्च चलाने में आप अपनी मर्जी से छोटा सहयोग दे सकते हैं।'
      };
      const ADMIN_SUPPORT = DEFAULT_ADMIN_SUPPORT;
      const APP_VERSION = 'v1.0';
      const APP_SHARE_LINK = 'https://www.appcreator24.com/app4234788-mq0opg';   // App download link - WhatsApp share me judega
      const FACILITIES = ['औरतों का हिस्सा', 'वुज़ूख़ाना', 'पार्किंग', 'व्हीलचेयर', 'क़ब्रिस्तान', 'जनाज़ा सेवा'];
      const upiLink = (upi, name, amt) => `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name || '')}&cu=INR${amt ? '&am=' + amt : ''}`;

      // ---- list ke teen barabar chhote button ----
      const pillBase = 'w-[30px] h-[30px] rounded-lg flex items-center justify-center border active:scale-95 transition';
      // ---- Verified Blue Tick Badge ----
      const VerifiedBadge = ({ size = 'md', className = '' }) => {
        const sizeClasses = size === 'xs'
          ? 'w-3 h-3'
          : size === 'sm'
            ? 'w-3.5 h-3.5'
            : size === 'lg'
              ? 'w-5 h-5'
              : 'w-4 h-4';
        const iconClasses = size === 'xs'
          ? 'w-1.5 h-1.5'
          : size === 'sm'
            ? 'w-2 h-2'
            : size === 'lg'
              ? 'w-3 h-3'
              : 'w-2.5 h-2.5';
        return (
          <span
            className={`inline-flex items-center justify-center rounded-full bg-sky-500 text-white shrink-0 shadow-xs ${sizeClasses} ${className}`}
            title="सत्यापित मस्जिद (Verified Mosque)"
          >
            <svg className={iconClasses} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </span>
        );
      };

      const FavButton = ({ isFav, onClick }) => (
        <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={isFav ? 'पसंदीदा से हटाएं' : 'पसंदीदा बनाएं'} className={`${pillBase} ${isFav ? 'bg-amber-400 border-amber-500 text-slate-900' : 'bg-white dark:bg-slate-800 border-amber-300 text-amber-600'}`}>
          <svg className={`w-[18px] h-[18px] stroke-current ${isFav ? 'fill-slate-900' : 'fill-transparent'}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
        </button>
      );
      const InfoButton = ({ onClick }) => (
        <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="मस्जिद की जानकारी" className={`${pillBase} bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300`}>
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.5" /></svg>
        </button>
      );
      const formatNoticeDateTime = (dateInput = new Date()) => {
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput || '');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(d.getDate()).padStart(2, '0');
        const mon = months[d.getMonth()];
        const yr = d.getFullYear();
        let hours = d.getHours();
        const mins = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        const hr = String(hours).padStart(2, '0');
        return `${day},${mon},${yr} ${hr}:${mins}${ampm}`;
      };

      const openNativeGoogleMaps = (m) => {
        if (!m || !m.lat || !m.lng) return;
        const lat = m.lat;
        const lng = m.lng;
        const label = encodeURIComponent(m.name || 'Masjid');
        const ua = (navigator.userAgent || '').toLowerCase();
        const isAndroid = ua.includes('android');
        const isIOS = /iphone|ipad|ipod/.test(ua);

        if (isAndroid) {
          // Direct Intent to native Google Maps Android app - completely eliminates browser tabs / Chrome feel!
          try {
            window.location.href = `intent://maps.google.com/maps?daddr=${lat},${lng}&directionsmode=driving#Intent;scheme=https;package=com.google.android.apps.maps;end;`;
          } catch (e) {
            window.location.href = `google.navigation:q=${lat},${lng}&mode=d`;
          }
          return;
        }
        if (isIOS) {
          window.location.href = `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
          return;
        }
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
      };

      const RouteButton = ({ m }) => (
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); openNativeGoogleMaps(m); }} 
          aria-label="Google Maps रास्ता" 
          title="Google Maps में सीधा रास्ता देखें"
          className={`${pillBase} bg-white dark:bg-slate-800 border-rose-300 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 active:scale-95`}
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
        </button>
      );

      const openNativeWhatsApp = (phone, text) => {
        const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
        const encText = encodeURIComponent(text || '');
        const ua = (navigator.userAgent || '').toLowerCase();
        const isAndroid = ua.includes('android');

        if (isAndroid) {
          // Direct Intent to native WhatsApp app on Android & AppCreator24 WebView
          // ZERO browser feel - bypasses Chrome / browser tabs completely!
          try {
            window.location.href = `intent://send?phone=${cleanPhone}&text=${encText}#Intent;scheme=whatsapp;package=com.whatsapp;end;`;
            return;
          } catch (e) {
            window.location.href = `whatsapp://send?phone=${cleanPhone}&text=${encText}`;
            return;
          }
        }

        // Direct app URL for iOS / other devices
        try {
          window.location.href = `whatsapp://send?phone=${cleanPhone}&text=${encText}`;
          setTimeout(() => {
            if (document.hidden) return;
            window.open(`https://wa.me/${cleanPhone}?text=${encText}`, '_blank');
          }, 600);
        } catch (e) {
          window.open(`https://wa.me/${cleanPhone}?text=${encText}`, '_blank');
        }
      };

      const InfoRow = ({ label, value }) => (value ? <div className="flex justify-between gap-3 text-[13px]"><span className="text-slate-500 shrink-0">{label}</span><b className="text-right break-words">{value}</b></div> : null);

      // ---- Ramzan helpers ----
      const hijriParts = (d) => {
        try {
          const ps = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
          const g = (k) => parseInt(ps.find(x => x.type === k).value, 10);
          return { d: g('day'), m: g('month'), y: g('year') };
        } catch (e) { return null; }
      };
      const getRamadanStart = (now, offsetDays) => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
        for (let i = -29; i < 430; i++) {
          const g = new Date(today.getTime() + i * 86400000);
          const hp = hijriParts(new Date(g.getTime() - offsetDays * 86400000));
          if (hp && hp.m === 9 && hp.d === 1) return g;
        }
        return null;
      };
      const toLocalIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const parseIsoLocal = (iso) => {
        if (!iso || typeof iso !== 'string' || !iso.includes('-')) return null;
        const [y, m, d] = iso.split('-').map(Number);
        if (!y || !m || !d) return null;
        const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      };
      const makeLocalDateTime = (dayDate, time24) => {
        const parts = String(time24 || '04:45').split(':').map(Number);
        return new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), parts[0] || 0, parts[1] || 0, 0, 0);
      };
      const formatDurationShort = (diffMs) => {
        const totalMin = Math.max(0, Math.ceil(diffMs / 60000));
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      };
      const findUpcomingOrActiveRamadan = (now = new Date()) => {
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const noonToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
        for (let i = -30; i <= 420; i++) {
          const g = new Date(noonToday.getTime() + i * 86400000);
          const hp = hijriParts(g);
          if (hp && hp.m === 9 && hp.d === 1) {
            const gMid = new Date(g.getFullYear(), g.getMonth(), g.getDate(), 0, 0, 0, 0);
            const gEnd = new Date(gMid.getTime() + 29 * 86400000);
            if (gEnd >= todayMid) {
              return { startDt: gMid, startIso: toLocalIso(gMid), hijriYear: hp.y || 1448 };
            }
          }
        }
        const fb = new Date(now.getFullYear() + 1, 1, 1, 0, 0, 0, 0);
        return { startDt: fb, startIso: toLocalIso(fb), hijriYear: 1448 };
      };
      const getSmartRamadanState = (masjid, now = new Date(), build30Fn) => {
        const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayIso = toLocalIso(now);
        const sch = normSchedule(masjid && masjid.schedule);
        const baseSehri24 = sch.khatmSehri || addMinutesToTime(sch.fajr || '05:20', -15);
        const baseIftar24 = sch.maghrib || '17:50';

        const est = findUpcomingOrActiveRamadan(now);
        const rz = (masjid && masjid.ramzan) || {};
        const confirmedDt = (rz.moonConfirmed && rz.confirmedStartDate) ? parseIsoLocal(rz.confirmedStartDate) : null;
        let isMoonConfirmed = false;
        let isRamadanActive = false;
        let rozaDayNumber = 0;

        if (confirmedDt) {
          const daysSince = Math.round((todayMid.getTime() - confirmedDt.getTime()) / 86400000);
          const maxDays = Number(rz.confirmedRozaCount) || 30;
          if (daysSince >= -7 && daysSince < maxDays) {
            isMoonConfirmed = true;
            if (daysSince >= 0) {
              isRamadanActive = true;
              rozaDayNumber = daysSince + 1;
            }
          }
        }

        const startIso = isMoonConfirmed ? rz.confirmedStartDate : est.startIso;
        const startDt = (isMoonConfirmed ? confirmedDt : est.startDt) || est.startDt;
        const ramadanYear = startDt.getFullYear();
        const hpStart = hijriParts(new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate(), 12));
        const hijriYear = (hpStart && hpStart.y) ? hpStart.y : est.hijriYear;

        let daysList = [];
        if (isMoonConfirmed && Array.isArray(rz.days) && rz.days.length === 30 && rz.days[0] && rz.days[0].date === startIso) {
          daysList = rz.days.map((d, idx) => ({
            day: idx + 1,
            date: d.date,
            sehri: d.sehri || rz.sehri || baseSehri24,
            iftar: d.iftar || rz.iftar || baseIftar24
          }));
        } else if (!isMoonConfirmed && Array.isArray(rz.days) && rz.days.length === 30 && rz.days[0] && rz.days[0].date) {
          const rzDt0 = parseIsoLocal(rz.days[0].date);
          if (rzDt0 && Math.abs((rzDt0.getTime() - est.startDt.getTime()) / 86400000) <= 45) {
            daysList = rz.days;
          }
        }
        if (!daysList.length && typeof build30Fn === 'function') {
          const bSehri = isMoonConfirmed ? (rz.sehri || baseSehri24) : baseSehri24;
          const bIftar = isMoonConfirmed ? (rz.iftar || baseIftar24) : baseIftar24;
          daysList = build30Fn(startIso, bSehri, bIftar, true);
        }

        const todayRow = daysList.find(d => d.date === todayIso) || null;
        const todaySehri24 = (todayRow && todayRow.sehri) || (isMoonConfirmed && rz.sehri) || baseSehri24;
        const todayIftar24 = (todayRow && todayRow.iftar) || (isMoonConfirmed && rz.iftar) || baseIftar24;
        const daysUntilStart = Math.max(0, Math.round((startDt.getTime() - todayMid.getTime()) / 86400000));

        let countdownTargetType = 'sehri';
        let homeLineIcon = '🌙';
        let homeLineText = `रमज़ान आने में ${daysUntilStart} दिन बाक़ी (संभावित)`;
        let homeRightBadge = `${startDt.getDate()} ${MONTHS_SHORT[startDt.getMonth()]} ${startDt.getFullYear()}`;

        if (isMoonConfirmed && isRamadanActive) {
          const sehriDt = makeLocalDateTime(now, todaySehri24);
          const iftarDt = makeLocalDateTime(now, todayIftar24);
          if (now < sehriDt) {
            countdownTargetType = 'sehri';
            homeLineIcon = '🌙';
            homeLineText = `रोज़ा #${rozaDayNumber} • सहरी ख़त्म होने में ${formatDurationShort(sehriDt - now)} बाक़ी`;
            homeRightBadge = t12('khatmSehri', todaySehri24);
          } else if (now < iftarDt) {
            countdownTargetType = 'iftar';
            homeLineIcon = '🌇';
            homeLineText = `रोज़ा #${rozaDayNumber} • इफ़्तार में ${formatDurationShort(iftarDt - now)} बाक़ी`;
            homeRightBadge = t12('iftar', todayIftar24);
          } else if (rozaDayNumber < 30) {
            const nextRow = daysList[rozaDayNumber];
            const tomorrowSehri24 = (nextRow && nextRow.sehri) || baseSehri24;
            const tomorrowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const tomorrowSehriDt = makeLocalDateTime(tomorrowMid, tomorrowSehri24);
            countdownTargetType = 'sehri';
            homeLineIcon = '🌙';
            homeLineText = `कल रोज़ा #${rozaDayNumber + 1} • सहरी में ${formatDurationShort(tomorrowSehriDt - now)} बाक़ी`;
            homeRightBadge = t12('khatmSehri', tomorrowSehri24);
          } else {
            countdownTargetType = 'iftar';
            homeLineIcon = '✨';
            homeLineText = 'माह-ए-रमज़ान मुकम्मल — चाँद मुबारक!';
            homeRightBadge = 'कैलेंडर';
          }
        } else if (isMoonConfirmed && daysUntilStart > 0) {
          countdownTargetType = 'sehri';
          homeLineIcon = '🌙';
          homeLineText = daysUntilStart === 1 ? 'चाँद कन्फर्म! कल से पहला रोज़ा शुरू' : `चाँद कन्फर्म! ${daysUntilStart} दिन बाद पहला रोज़ा`;
          homeRightBadge = `${startDt.getDate()} ${MONTHS_SHORT[startDt.getMonth()]}`;
        }

        return {
          isMoonConfirmed,
          isRamadanActive,
          rozaDayNumber,
          daysUntilStart,
          startDateIso: startIso,
          ramadanYear,
          hijriYear,
          baseSehri24,
          baseIftar24,
          todaySehri24,
          todayIftar24,
          daysList,
          countdownTargetType,
          homeLineIcon,
          homeLineText,
          homeRightBadge
        };
      };

      // ---- Qibla compass ----
      const KAABA = { lat: 21.4225, lng: 39.8262 };
      const qiblaBearing = (lat, lng) => {
        const r = Math.PI / 180; const p1 = lat * r, p2 = KAABA.lat * r, dl = (KAABA.lng - lng) * r;
        const y = Math.sin(dl) * Math.cos(p2); const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return (Math.atan2(y, x) / r + 360) % 360;
      };
      const kaabaDistanceKm = (lat, lng) => {
        const r = Math.PI / 180; const dLat = (KAABA.lat - lat) * r, dLng = (KAABA.lng - lng) * r;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * r) * Math.cos(KAABA.lat * r) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const QiblaCompass = ({ lat, lng, hasGps, onGps }) => {
        const [heading, setHeading] = useState(null); const [active, setActive] = useState(false); const [msg, setMsg] = useState('');
        const bearing = hasGps ? qiblaBearing(lat, lng) : null;
        useEffect(() => {
          if (!active) return;
          const handler = (ev) => {
            let h = null;
            if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading;
            else if (ev.absolute && typeof ev.alpha === 'number') h = (360 - ev.alpha) % 360;
            if (h !== null) setHeading(h);
          };
          window.addEventListener('deviceorientationabsolute', handler, true); window.addEventListener('deviceorientation', handler, true);
          return () => { window.removeEventListener('deviceorientationabsolute', handler, true); window.removeEventListener('deviceorientation', handler, true); };
        }, [active]);
        const start = async () => {
          try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
              const r = await DeviceOrientationEvent.requestPermission();
              if (r !== 'granted') { setMsg('सेंसर की इजाज़त नहीं मिली। ब्राउज़र सेटिंग में मोशन/ओरिएंटेशन की इजाज़त दें।'); return; }
            }
            setActive(true); setMsg('');
          } catch (e) { setMsg('इस फोन/ब्राउज़र में कंपास सेंसर उपलब्ध नहीं है।'); }
        };
        const diff = bearing !== null && heading !== null ? ((bearing - heading + 540) % 360) - 180 : null;
        const aligned = diff !== null && Math.abs(diff) < 5;
        const arrowRot = bearing !== null ? (heading !== null ? bearing - heading : bearing) : 0;
        const northRot = heading !== null ? -heading : 0;
        return (
          <div className="flex flex-col items-center gap-3">
            <svg width="260" height="260" viewBox="0 0 260 260" role="img" aria-label="क़िब्ला कंपास">
              <circle cx="130" cy="130" r="120" fill="none" stroke="#9bb8a6" strokeWidth="3" />
              <circle cx="130" cy="130" r="104" fill="none" stroke="#c9dccf" strokeWidth="1" />
              <g transform={`rotate(${northRot} 130 130)`}>
                <text x="130" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="#b91c1c">N</text>
                <text x="130" y="244" textAnchor="middle" fontSize="13" fill="#6b7a72">S</text>
                <text x="238" y="135" textAnchor="middle" fontSize="13" fill="#6b7a72">E</text>
                <text x="22" y="135" textAnchor="middle" fontSize="13" fill="#6b7a72">W</text>
              </g>
              {bearing !== null && (
                <g transform={`rotate(${arrowRot} 130 130)`}>
                  <polygon points="130,48 146,130 114,130" fill={aligned ? '#16a34a' : '#07382c'} />
                  <polygon points="114,130 146,130 130,190" fill="#cbd5d0" />
                  <circle cx="130" cy="130" r="8" fill="#eab308" />
                  <text x="130" y="42" textAnchor="middle" fontSize="15">🕋</text>
                </g>
              )}
            </svg>
            {bearing === null ? (
              <button onClick={onGps} className="px-4 py-2.5 bg-[#07382c] text-white rounded-xl text-sm font-bold">📍 अपनी लोकेशन लगाएं</button>
            ) : (
              <div className="text-center space-y-1">
                <div className="text-sm font-bold">क़िब्ला: उत्तर से {Math.round(bearing)}°</div>
                <div className="text-[11px] text-slate-500">काबा यहाँ से लगभग {Math.round(kaabaDistanceKm(lat, lng)).toLocaleString('en-IN')} km</div>
                {aligned && <div className="text-emerald-600 font-extrabold text-sm">✅ आप क़िब्ले की तरफ़ हैं</div>}
              </div>
            )}
            {!active ? (
              <button onClick={start} className="px-5 py-2.5 bg-amber-400 text-slate-900 rounded-xl text-sm font-extrabold min-h-[44px]">🧭 कंपास चालू करें</button>
            ) : heading === null ? (
              <p className="text-[11px] text-amber-700 text-center">दिशा नहीं मिल रही। फोन को सीधा पकड़ें और हवा में 8 की शकल में घुमाएं।</p>
            ) : (
              <p className="text-[11px] text-slate-500 text-center">हरा तीर क़िब्ले की तरफ़ है। तीर सीधा ऊपर आ जाए तो वही रुख़ है।</p>
            )}
            {msg && <p className="text-[11px] text-rose-600 text-center">{msg}</p>}
            <p className="text-[10px] text-slate-400 text-center">नोट: मोबाइल सेंसर में थोड़ा फ़र्क़ हो सकता है। धातु और चुंबक से दूर रखें।</p>
          </div>
        );
      };

      const LocationPicker = ({ lat, lng, onChange, height = 380 }) => {
        const elRef = useRef(null); const mapRef = useRef(null); const markerRef = useRef(null);
        useEffect(() => {
          if (!window.L || !elRef.current || mapRef.current) return;
          const L = window.L;
          const map = L.map(elRef.current, {
            maxZoom: 20,
            zoomSnap: 0.1,
            zoomDelta: 0.25,
            wheelPxPerZoomLevel: 100,
            wheelDebounceTime: 20,
            zoomAnimation: true,
            zoomAnimationThreshold: 8,
            fadeAnimation: true,
            scrollWheelZoom: true,
            touchZoom: true,
            bounceAtZoomLimits: true,
            zoomControl: false // custom smooth controls
          }).setView([lat, lng], 17);

          const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Maps'
          });
          googleHybrid.addTo(map);
          map.setMaxZoom(20);

          const icon = L.divIcon({ html: '<div style="font-size:34px;line-height:34px;margin-top:-32px;margin-left:-17px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));">📍</div>', className: '', iconSize: [0, 0] });
          const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
          marker.on('dragend', () => { const q = marker.getLatLng(); onChange(q.lat, q.lng); });
          map.on('click', (ev) => { marker.setLatLng(ev.latlng); onChange(ev.latlng.lat, ev.latlng.lng); });
          mapRef.current = map; markerRef.current = marker;
          setTimeout(() => map.invalidateSize(), 200);
          return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
        }, []);
        useEffect(() => {
          if (!mapRef.current || !markerRef.current) return;
          markerRef.current.setLatLng([lat, lng]);
          if (!mapRef.current.getBounds().contains([lat, lng])) mapRef.current.setView([lat, lng], 17);
        }, [lat, lng]);

        const handleZoomIn = (e) => { e.preventDefault(); e.stopPropagation(); if (mapRef.current) mapRef.current.zoomIn(0.5); };
        const handleZoomOut = (e) => { e.preventDefault(); e.stopPropagation(); if (mapRef.current) mapRef.current.zoomOut(0.5); };

        if (!window.L) return <div className="p-3 text-center text-[11px] text-rose-500 border rounded-xl">मैप लोड नहीं हुआ (इंटरनेट जाँचें)। नीचे GPS बटन से लोकेशन लगा सकते हैं।</div>;
        return (
          <div className="relative rounded-2xl overflow-hidden border border-emerald-300 dark:border-emerald-700 shadow-md">
            <div ref={elRef} style={{ height: height, isolation: 'isolate' }} className="w-full" />
            <div className="absolute top-2.5 right-2.5 z-[400] bg-black/75 backdrop-blur-xs text-white text-[10.5px] font-bold px-2.5 py-1 rounded-full shadow pointer-events-none border border-white/20">
              🛰️ Google Satellite Map
            </div>
            {/* Quick Smooth Zoom Buttons for Easy Mobile Use */}
            <div className="absolute bottom-2.5 right-2.5 z-[400] flex flex-col gap-1.5 shadow-lg">
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                className="w-8 h-8 rounded-xl bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-white font-black text-base flex items-center justify-center border border-slate-300 dark:border-slate-600 hover:bg-white active:scale-95 transition backdrop-blur-xs"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                className="w-8 h-8 rounded-xl bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-white font-black text-base flex items-center justify-center border border-slate-300 dark:border-slate-600 hover:bg-white active:scale-95 transition backdrop-blur-xs"
              >
                −
              </button>
            </div>
          </div>
        );
      };

      const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'];
      const getHijriToday = (d = new Date()) => {
        try {
          const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
          const g = (type) => parseInt(parts.find(x => x.type === type).value, 10);
          return `${g('day')} ${HIJRI_MONTHS[g('month') - 1]} ${g('year')}`;
        } catch (e) { return ''; }
      };

      // ----------------------------------------------------
      // MAIN APP
      // ----------------------------------------------------
      function MasjidConnectApp() {
        const [masjids, setMasjids] = useState(() => { try { const raw = safeStorageGet('mc_db_v12'); return raw ? JSON.parse(raw) : {}; } catch { return {}; } });
        const [favorites, setFavorites] = useState(() => { try { const raw = safeStorageGet('mc_user_favorites'); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) && parsed.length > 0 ? [parsed[0]] : []; } catch { return []; } });
        
        const [currentTab, setCurrentTab] = useState('home');
        const [selectedMasjidId, setSelectedMasjidId] = useState(() => safeStorageGet('mc_selected_masjid_id'));
        const [loggedImamMasjidId, setLoggedImamMasjidId] = useState(() => safeStorageGet('mc_logged_imam_masjid_id'));
        
        // Modals
        const [showImamLoginModal, setShowImamLoginModal] = useState(false);
        const [showRegisterModal, setShowRegisterModal] = useState(false);
        const [showEditProfileModal, setShowEditProfileModal] = useState(false);
        const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
        const [showNotificationsModal, setShowNotificationsModal] = useState(false);
        const [notifModalItems, setNotifModalItems] = useState([]);
        const [showForgotCredentialsModal, setShowForgotCredentialsModal] = useState(false);
        const [showEditHadithModal, setShowEditHadithModal] = useState(false);
        const [showEditTimeModal, setShowEditTimeModal] = useState(false);
        const [showDeleteSafetyModal, setShowDeleteSafetyModal] = useState(false);
        const [showNewNoticeModal, setShowNewNoticeModal] = useState(false);
        const [showPremiumPaywallModal, setShowPremiumPaywallModal] = useState(false);
        const [paywallTargetMasjid, setPaywallTargetMasjid] = useState(null);
        const [paywallTargetService, setPaywallTargetService] = useState(null); // 'profileServices' | 'liveAzan' | 'blueTick' | null
        const [paymentUtrInput, setPaymentUtrInput] = useState('');
        const [paymentDateTimeInput, setPaymentDateTimeInput] = useState('');
        // Forms & Inputs
        const [loginMasjidId, setLoginMasjidId] = useState('');
        const [loginPasscode, setLoginPasscode] = useState('');
        const [loginError, setLoginError] = useState(false);
        const [landingRoleChoice, setLandingRoleChoice] = useState(() => safeStorageGet('mc_user_role_choice'));
        
        const [newPassword, setNewPassword] = useState('');
        const [confirmPassword, setConfirmPassword] = useState('');
        
        const [editHadithText, setEditHadithText] = useState('');
        const [editHadithRef, setEditHadithRef] = useState('');
        const [editEnglishDate, setEditEnglishDate] = useState('');
        const [editHijriDate, setEditHijriDate] = useState('');
        
        const defaultSchedule = DEFAULT_SCHEDULE;
        const [editSchedule, setEditSchedule] = useState({});

        // Cascading State and District for Mosque Registration
        const [regState, setRegState] = useState('Uttar Pradesh');
        const [regDistrict, setRegDistrict] = useState('Mau');
        const [regCustomDistrict, setRegCustomDistrict] = useState('');

        const [deletePasswordInput, setDeletePasswordInput] = useState('');
        const [forgotPhoneInput, setForgotPhoneInput] = useState('');
        const [passwordResetRequests, setPasswordResetRequests] = useState(() => {
          try { return JSON.parse(safeStorageGet('mc_pwd_resets', '[]')); } catch(e) { return []; }
        });
        const [resetSuccessNotice, setResetSuccessNotice] = useState(null);
        const [newNoticeTitle, setNewNoticeTitle] = useState('');
        const [newNoticeMessage, setNewNoticeMessage] = useState('');
        const [isRefreshing, setIsRefreshing] = useState(false);
        const [pullDistance, setPullDistance] = useState(0);
        const touchStartYRef = useRef(0);
        const isPullingRef = useRef(false);

        // Real-Time States
        const [liveBroadcasts, setLiveBroadcasts] = useState({});
        const [isImamLive, setIsImamLive] = useState(false);
        const [activeListeningMasjidId, setActiveListeningMasjidId] = useState(null);
        const [incomingAzanAlert, setIncomingAzanAlert] = useState(null);
        const [darkMode, setDarkMode] = useState(() => safeStorageGet('mc_dark_mode') === 'true');
        const toggleDarkMode = () => { setDarkMode(!darkMode); safeStorageSet('mc_dark_mode', String(!darkMode)); };
        // Tailwind ke dark: classes tabhi chalte hain jab <html> par 'dark' class ho
        useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); document.body.style.backgroundColor = darkMode ? '#0f172a' : ''; }, [darkMode]);

        // GPS & Images
        const [userLocation, setUserLocation] = useState(() => { 
          try { 
            const raw = safeStorageGet('mc_user_location'); 
            if (raw) {
              const p = JSON.parse(raw);
              if (p && typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng)) {
                return p;
              }
            } 
          } catch(e) {} 
          return null; 
        });
        const [hasGps, setHasGps] = useState(() => {
          try {
            const raw = safeStorageGet('mc_user_location');
            if (raw) {
              const p = JSON.parse(raw);
              return !!(p && typeof p.lat === 'number' && !isNaN(p.lat));
            }
          } catch(e) {}
          return false;
        });
        const [isFetchingGps, setIsFetchingGps] = useState(false);
        const [isInitialSyncing, setIsInitialSyncing] = useState(() => Object.keys(masjids).length === 0);
        
        const [regLat, setRegLat] = useState(() => (userLocation ? userLocation.lat : 28.6139));
        const [regLng, setRegLng] = useState(() => (userLocation ? userLocation.lng : 77.2090));
        const [regPhotoUrl, setRegPhotoUrl] = useState('');
        
        const [editLat, setEditLat] = useState(28.6139);
        const [editLng, setEditLng] = useState(77.2090);
        const [showEditPass, setShowEditPass] = useState(false);
        const [infoMasjidId, setInfoMasjidId] = useState(null);
        const [infoBackTab, setInfoBackTab] = useState('home');
        const [showInfoEditModal, setShowInfoEditModal] = useState(false);
        const [infoDraft, setInfoDraft] = useState({});
        const [qrFull, setQrFull] = useState(null);
        const [ramzanOffset, setRamzanOffset] = useState(() => (safeStorageGet('mc_ramzan_offset') === '0' ? 0 : 1));
        useEffect(() => { try { window.scrollTo(0, 0); } catch (e) {} }, [currentTab]);
        const [editPhotoUrl, setEditPhotoUrl] = useState('');

        const [currentTime, setCurrentTime] = useState(new Date());
        const [readNotificationIds, setReadNotificationIds] = useState(() => { try { return JSON.parse(safeStorageGet('mc_read_notifs') || '[]'); } catch { return []; } });

        const [toast, setToast] = useState(null);
        const [cloudOnline, setCloudOnline] = useState(() => !!(mqttClient && mqttClient.connected));
        const [liveAzanOn, setLiveAzanOn] = useState(() => safeStorageGet('mc_live_azan_on') !== '0');
        const [showPermModal, setShowPermModal] = useState(() => safeStorageGet('mc_perm_asked') !== '1');
        const [showRamzanEditModal, setShowRamzanEditModal] = useState(false);
        const [ramzanDraft, setRamzanDraft] = useState({ sehri: '', iftar: '', startDate: '', moonConfirmed: false, days: [] });
        const [showFeedbackModal, setShowFeedbackModal] = useState(false);
        const [feedbackMsg, setFeedbackMsg] = useState('');
        const [showServerSupportModal, setShowServerSupportModal] = useState(false);
        const [adminSupport, setAdminSupport] = useState(() => {
          try {
            const raw = safeStorageGet('mc_admin_support');
            if (raw) return { ...DEFAULT_ADMIN_SUPPORT, ...JSON.parse(raw) };
          } catch(e) {}
          return DEFAULT_ADMIN_SUPPORT;
        });
        const [adminAnnouncements, setAdminAnnouncements] = useState(() => {
          try {
            const raw = safeStorageGet('mc_admin_anns');
            if (raw) return JSON.parse(raw);
            const single = safeStorageGet('mc_global_ann');
            return single ? [JSON.parse(single)] : [];
          } catch(e) { return []; }
        });
        const [dismissedAnnId, setDismissedAnnId] = useState(() => {
          return safeStorageGet('mc_dismissed_ann_id') || '';
        });
        const globalAnnouncement = (adminAnnouncements && adminAnnouncements.length > 0) ? adminAnnouncements[0] : null;
        const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(prev => (prev && prev.message === message ? null : prev)), 3800); };

        // Qaza Namaz Tracker State
        const [qazaData, setQazaData] = useState(() => {
          try {
            const raw = safeStorageGet('mc_qaza_tracker_v1');
            if (raw) return JSON.parse(raw);
          } catch(e) {}
          return {
            fajr: 0, zuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0,
            completed: { fajr: 0, zuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 }
          };
        });
        const [showCustomDaysModal, setShowCustomDaysModal] = useState(false);
        const [customDaysInput, setCustomDaysInput] = useState('');

        const updateQazaPrayer = (prayerKey, change, isCompleted = false) => {
          setQazaData(prev => {
            const next = { ...prev };
            if (isCompleted) {
              if (next[prayerKey] > 0) {
                next[prayerKey] = Math.max(0, next[prayerKey] - 1);
                next.completed = next.completed || { fajr: 0, zuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 };
                next.completed[prayerKey] = (next.completed[prayerKey] || 0) + 1;
                showToast(`✅ 1 ${prayerKey.toUpperCase()} क़ज़ा अदा हुई (अल्लाह क़बूल फ़रमाए)`);
              } else {
                showToast('इस नमाज़ की कोई क़ज़ा बाक़ी नहीं है!', 'info');
              }
            } else {
              next[prayerKey] = Math.max(0, (next[prayerKey] || 0) + change);
            }
            safeStorageSet('mc_qaza_tracker_v1', JSON.stringify(next));
            return next;
          });
        };

        const setBulkQazaDays = (days) => {
          const d = parseInt(days, 10);
          if (isNaN(d) || d <= 0) return showToast('कृपया सही दिन दर्ज करें', 'error');
          setQazaData(prev => {
            const next = {
              fajr: (prev.fajr || 0) + d,
              zuhr: (prev.zuhr || 0) + d,
              asr: (prev.asr || 0) + d,
              maghrib: (prev.maghrib || 0) + d,
              isha: (prev.isha || 0) + d,
              witr: (prev.witr || 0) + d,
              completed: prev.completed || { fajr: 0, zuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 }
            };
            safeStorageSet('mc_qaza_tracker_v1', JSON.stringify(next));
            showToast(`✅ ${d} दिनों की क़ज़ा नमाज़ें जोड़ी गईं`);
            return next;
          });
          setShowCustomDaysModal(false);
          setCustomDaysInput('');
        };

        const resetQazaTracker = () => {
          if (window.confirm('क्या आप सचमुच पूरा क़ज़ा रिकॉर्ड रीसेट करना चाहते हैं?')) {
            const empty = {
              fajr: 0, zuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0,
              completed: { fajr: 0, zuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 }
            };
            setQazaData(empty);
            safeStorageSet('mc_qaza_tracker_v1', JSON.stringify(empty));
            showToast('✅ क़ज़ा रिकॉर्ड रीसेट कर दिया गया');
          }
        };

        // Daily Namaz Tracker State (Matching Infographic)
        const [trackerProfile, setTrackerProfile] = useState(() => {
          return {
            name: safeStorageGet('mc_tracker_user_name') || 'Md Shahid Hussain',
            place: safeStorageGet('mc_tracker_user_place') || 'Jhirwa Purwari'
          };
        });
        const [showTrackerProfileModal, setShowTrackerProfileModal] = useState(false);
        const [trackerNameInput, setTrackerNameInput] = useState(trackerProfile.name);
        const [trackerPlaceInput, setTrackerPlaceInput] = useState(trackerProfile.place);

        const [dailyNamazRecords, setDailyNamazRecords] = useState(() => {
          try {
            const raw = safeStorageGet('mc_daily_namaz_logs');
            if (raw) return JSON.parse(raw);
          } catch(e) {}
          return {};
        });

        const [namazTrackerSubTab, setNamazTrackerSubTab] = useState('home'); // 'home' | 'report' | 'calendar' | 'export'
        const getTodayIso = () => {
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const [trackerSelectedDate, setTrackerSelectedDate] = useState(getTodayIso);
        const [reportFilter, setReportFilter] = useState('1week'); // '1day' | '1week' | '1month' | 'custom'
        const [calMonthOffset, setCalMonthOffset] = useState(0);
        const [exportStartInput, setExportStartInput] = useState(() => {
          const d = new Date();
          d.setDate(1);
          return d.toISOString().slice(0, 10);
        });
        const [exportEndInput, setExportEndInput] = useState(getTodayIso);

        const toggleNamazRecord = (dateIso, prayerKey) => {
          setDailyNamazRecords(prev => {
            const dayRecord = prev[dateIso] || { fajr: false, zuhr: false, asr: false, maghrib: false, isha: false };
            const updatedDay = { ...dayRecord, [prayerKey]: !dayRecord[prayerKey] };
            const next = { ...prev, [dateIso]: updatedDay };
            safeStorageSet('mc_daily_namaz_logs', JSON.stringify(next));
            if (updatedDay[prayerKey]) {
              showToast(`✅ ${prayerKey.toUpperCase()} नमाज़ अदा मार्क हो गई!`);
            } else {
              showToast(`⚪ ${prayerKey.toUpperCase()} नमाज़ बाक़ी मार्क हुई`, 'info');
            }
            return next;
          });
        };

        const saveTrackerProfile = () => {
          const trimmedName = (trackerNameInput || '').trim() || 'Md Shahid Hussain';
          const trimmedPlace = (trackerPlaceInput || '').trim() || 'Jhirwa Purwari';
          const next = { name: trimmedName, place: trimmedPlace };
          setTrackerProfile(next);
          safeStorageSet('mc_tracker_user_name', trimmedName);
          safeStorageSet('mc_tracker_user_place', trimmedPlace);
          setShowTrackerProfileModal(false);
          showToast('✅ प्रोफ़ाइल सेव हो गई');
        };

        const exportNamazRecordsCsv = (startDateIso, endDateIso) => {
          try {
            const start = new Date(startDateIso);
            const end = new Date(endDateIso);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
              return showToast('अमान्य तारीख़ रेंज', 'error');
            }
            let rows = [['Date', 'Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha', 'Ada_Count', 'Total', 'Status']];
            let cur = new Date(start);
            while (cur <= end) {
              const y = cur.getFullYear();
              const m = String(cur.getMonth() + 1).padStart(2, '0');
              const d = String(cur.getDate()).padStart(2, '0');
              const iso = `${y}-${m}-${d}`;
              const rec = dailyNamazRecords[iso] || {};
              const f = rec.fajr ? 'Ada' : 'Baqi';
              const z = rec.zuhr ? 'Ada' : 'Baqi';
              const a = rec.asr ? 'Ada' : 'Baqi';
              const mg = rec.maghrib ? 'Ada' : 'Baqi';
              const is = rec.isha ? 'Ada' : 'Baqi';
              const adaCount = [rec.fajr, rec.zuhr, rec.asr, rec.maghrib, rec.isha].filter(Boolean).length;
              rows.push([iso, f, z, a, mg, is, adaCount, 5, `${adaCount}/5 Ada`]);
              cur.setDate(cur.getDate() + 1);
            }
            const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `Namaz_Report_${startDateIso}_to_${endDateIso}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('✅ नमाज़ रिपोर्ट डाउनलोड हो गई!');
          } catch(e) {
            showToast('डाउनलोड में त्रुटि', 'error');
          }
        };

        const handleGalleryPhotoUpload = (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            if (file.size > 8 * 1024 * 1024) return showToast('8MB से कम साइज़ की फ़ोटो चुनें', 'error');
            compressImageFile(file).then((url) => { setRegPhotoUrl(url); showToast('✅ गैलरी फ़ोटो सेट हो गई!'); }).catch(() => showToast('फ़ोटो नहीं खुल सकी', 'error'));
          }
        };

        const handleEditGalleryPhotoUpload = (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            if (file.size > 8 * 1024 * 1024) return showToast('8MB से कम साइज़ की फ़ोटो चुनें', 'error');
            compressImageFile(file).then((url) => { setEditPhotoUrl(url); showToast('✅ नई फ़ोटो सेट हो गई!'); }).catch(() => showToast('फ़ोटो नहीं खुल सकी', 'error'));
          }
        };

        const [tasbihStep, setTasbihStep] = useState(1);
        const [tasbihCount, setTasbihCount] = useState(0);
        const [tasbihLaps, setTasbihLaps] = useState(0);

        const handleTasbihTap = () => {
          if (navigator.vibrate) navigator.vibrate(35);
          if (tasbihStep === 1) { if (tasbihCount + 1 >= 33) { setTasbihStep(2); setTasbihCount(0); } else setTasbihCount(prev => prev + 1); }
          else if (tasbihStep === 2) { if (tasbihCount + 1 >= 33) { setTasbihStep(3); setTasbihCount(0); } else setTasbihCount(prev => prev + 1); }
          else if (tasbihStep === 3) { if (tasbihCount + 1 >= 34) { setTasbihStep(1); setTasbihCount(0); setTasbihLaps(prev => prev + 1); } else setTasbihCount(prev => prev + 1); }
        };

        useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);

        // CLOUD SYNC - ye effect sirf EK baar chalta hai; taaza state stateRef se aati hai
        const stateRef = useRef({});
        stateRef.current = { favorites, loggedImamMasjidId, isImamLive, activeListeningMasjidId, masjids, showToast, liveAzanOn };
        const alertedSessionsRef = useRef({});

        // GOOGLE FIREBASE FIRESTORE 24/7 PERMANENT CLOUD SYNC
        useEffect(() => {
          const safetyTimer = setTimeout(() => {
            setIsInitialSyncing(false);
          }, 2200);

          if (!firestoreDb) {
            setIsInitialSyncing(false);
            return () => clearTimeout(safetyTimer);
          }
          let unsubscribe = null;
          try {
            unsubscribe = firestoreDb.collection('masjids').onSnapshot((snapshot) => {
              setIsInitialSyncing(false);
              setMasjids(prev => {
                let changed = false;
                const next = { ...prev };
                snapshot.docChanges().forEach((change) => {
                  const id = change.doc.id;
                  if (change.type === 'removed') {
                    if (next[id]) {
                      delete next[id];
                      changed = true;
                    }
                  } else {
                    const cloudData = change.doc.data();
                    if (cloudData && cloudData.id) {
                      const ex = next[id];
                      if (!ex || (cloudData.updatedAt || 0) >= (ex.updatedAt || 0)) {
                        next[id] = { ...ex, ...cloudData };
                        changed = true;
                      }
                    }
                  }
                });
                if (changed) {
                  safeStorageSet('mc_db_v12', JSON.stringify(next));
                  return next;
                }
                return prev;
              });
            }, (err) => {
              setIsInitialSyncing(false);
              console.warn('Firestore snapshot notice (create Firestore database in Firebase console):', err);
            });
          } catch (e) {
            setIsInitialSyncing(false);
            console.warn('Firestore listener error:', e);
          }
          let unsubSettings = null;
          let unsubAnn = null;
          if (firestoreDb) {
            try {
              unsubSettings = firestoreDb.collection('config').doc('admin_settings').onSnapshot((doc) => {
                if (doc.exists) {
                  const data = doc.data();
                  if (data && typeof data === 'object') {
                    setAdminSupport(prev => {
                      const next = { ...prev, ...data };
                      safeStorageSet('mc_admin_support', JSON.stringify(next));
                      return next;
                    });
                  }
                }
              }, () => {});
            } catch(e) {}

            try {
              unsubAnn = firestoreDb.collection('config').doc('global_announcements').onSnapshot((doc) => {
                if (doc.exists) {
                  const data = doc.data();
                  const list = Array.isArray(data?.list) ? data.list.map(x => ({
                    ...x,
                    message: x.message || x.body,
                    isAdmin: true,
                    senderName: x.senderName || 'मस्जिद कनेक्ट एडमिन'
                  })) : [];
                  setAdminAnnouncements(list);
                  safeStorageSet('mc_admin_anns', JSON.stringify(list));

                  const latest = list[0];
                  if (latest && latest.id) {
                    const lastDismissed = safeStorageGet('mc_dismissed_ann_id') || '';
                    if (latest.id !== lastDismissed) {
                      showToast(`📢 👑 [एडमिन सूचना] ${latest.title}`);
                    }
                  }
                }
              }, () => {});
            } catch(e) {}
          }

          return () => { 
            clearTimeout(safetyTimer);
            if (unsubscribe) { try { unsubscribe(); } catch(e) {} } 
            if (unsubSettings) { try { unsubSettings(); } catch(e) {} }
            if (unsubAnn) { try { unsubAnn(); } catch(e) {} }
          };
        }, []);

        useEffect(() => {
          if (!mqttClient) return;
          let republishTimer = null;
          let pruneTimer = null;
          const persist = (obj) => safeStorageSet('mc_db_v12', JSON.stringify(obj));

          const handleConnect = () => {
            setCloudOnline(true);
            mqttClient.subscribe([ TOPIC_DB_PREFIX + '+', TOPIC_EVENTS, TOPIC_LIVE_AZAN, TOPIC_AUDIO_PREFIX + '+', TOPIC_ADMIN_SETTINGS ], { qos: 1 });
            clearTimeout(republishTimer);
            republishTimer = setTimeout(() => {
              const s = stateRef.current; const mine = s.loggedImamMasjidId && s.masjids[s.loggedImamMasjidId];
              if (mine && mqttClient.connected) mqttClient.publish(`${TOPIC_DB_PREFIX}${mine.id}`, JSON.stringify(mine), { retain: true, qos: 0 });
            }, 2500);
          };
          const handleOffline = () => setCloudOnline(false);
          mqttClient.on('connect', handleConnect);
          mqttClient.on('close', handleOffline);
          mqttClient.on('offline', handleOffline);
          if (mqttClient.connected) handleConnect();

          const handleMessage = (topic, message) => {
            const s = stateRef.current; const str = message.toString();
            if (topic.startsWith(TOPIC_DB_PREFIX)) {
              const mId = topic.slice(TOPIC_DB_PREFIX.length);
              if (message.length === 0 || str === '""' || str === '{}') {
                setMasjids(prev => { if (!prev[mId]) return prev; const u = { ...prev }; delete u[mId]; persist(u); return u; });
              } else {
                try {
                  const cloudData = JSON.parse(str);
                  if (cloudData && cloudData.id) {
                    seenIds.add(cloudData.id);
                    const old = s.masjids[cloudData.id];
                    if (old && s.favorites.includes(cloudData.id) && s.loggedImamMasjidId !== cloudData.id && Array.isArray(cloudData.notifications) && cloudData.notifications.length > (old.notifications || []).length && (cloudData.updatedAt || 0) > (old.updatedAt || 0)) {
                      const n = cloudData.notifications[0]; s.showToast(`📢 ${cloudData.name}: ${n.title}`);
                    }
                    setMasjids(prev => {
                      const ex = prev[cloudData.id];
                      if (ex && (cloudData.updatedAt || 0) <= (ex.updatedAt || 0)) return prev;
                      const merged = { ...prev, [cloudData.id]: { ...ex, ...cloudData } };
                      persist(merged); return merged;
                    });
                  }
                } catch (e) {}
              }
            }
            if (topic === TOPIC_EVENTS) {
              try {
                const ev = JSON.parse(str);
                if (ev.type === 'MASJID_ID_CHANGED' && ev.oldId && ev.newId) {
                  setFavorites(prev => { if (!prev.includes(ev.oldId)) return prev; const n = prev.map(x => (x === ev.oldId ? ev.newId : x)); safeStorageSet('mc_user_favorites', JSON.stringify(n)); return n; });
                  setSelectedMasjidId(prev => { if (prev !== ev.oldId) return prev; safeStorageSet('mc_selected_masjid_id', ev.newId); return ev.newId; });
                  setLoggedImamMasjidId(prev => { if (prev !== ev.oldId) return prev; safeStorageSet('mc_logged_imam_masjid_id', ev.newId); return ev.newId; });
                }
                if (ev.type === 'MASJID_DELETED' && ev.deletedId) {
                  setFavorites(prev => { const nextFavs = prev.filter(x => x !== ev.deletedId); safeStorageSet('mc_user_favorites', JSON.stringify(nextFavs)); return nextFavs; });
                  setSelectedMasjidId(prev => (prev === ev.deletedId ? null : prev));
                  setLoggedImamMasjidId(prev => { if (prev === ev.deletedId) { try { localStorage.removeItem('mc_logged_imam_masjid_id'); } catch (e) {} return null; } return prev; });
                }
                if (ev.type === 'FAVORITE_COUNT_UPDATE' && ev.masjidId) {
                  setMasjids(prev => {
                    const target = prev[ev.masjidId];
                    if (!target) return prev;
                    const cur = target.followersCount ?? target.favoritesCount ?? (s.favorites.includes(ev.masjidId) ? 1 : 0);
                    const nextCount = Math.max(0, cur + (ev.delta || 0));
                    const updated = { ...prev, [ev.masjidId]: { ...target, followersCount: nextCount, updatedAt: Date.now() } };
                    persist(updated);
                    return updated;
                  });
                }
                if (ev.type === 'GLOBAL_ANNOUNCEMENT' && ev.announcement) {
                  const a = {
                    ...ev.announcement,
                    message: ev.announcement.message || ev.announcement.body,
                    isAdmin: true,
                    senderName: ev.announcement.senderName || 'मस्जिद कनेक्ट एडमिनिस्ट्रेटर'
                  };
                  setAdminAnnouncements(prev => {
                    const next = [a, ...prev.filter(x => x.id !== a.id)].slice(0, 30);
                    safeStorageSet('mc_admin_anns', JSON.stringify(next));
                    return next;
                  });
                  showToast(`📢 👑 [एडमिन सूचना] ${a.title}`);
                }
              } catch (e) {}
            }
            if (topic === TOPIC_LIVE_AZAN) {
              try {
                const st = JSON.parse(str); if (!st || !st.masjidId) return;
                if (st.isLive) {
                  const ts = st.ts || st.startedAt || 0;
                  if (Date.now() - ts > LIVE_STALE_MS) return;
                  setLiveBroadcasts(prev => ({ ...prev, [st.masjidId]: Date.now() }));
                  const isSelf = s.isImamLive || (s.loggedImamMasjidId && s.loggedImamMasjidId === st.masjidId);
                  if (!isSelf && s.liveAzanOn && s.favorites.includes(st.masjidId) && alertedSessionsRef.current[st.masjidId] !== st.startedAt) {
                    alertedSessionsRef.current[st.masjidId] = st.startedAt;
                    azanStreamer.initContext(); azanStreamer.playMelodicAlarm();
                    try { if (document.hidden && window.Notification && Notification.permission === 'granted') new Notification('🔴 लाइव अज़ान चालू है', { body: (s.masjids[st.masjidId] && s.masjids[st.masjidId].name) || 'मस्जिद' }); } catch (e) {}
                    setIncomingAzanAlert({ masjidId: st.masjidId, masjidName: (s.masjids[st.masjidId] && s.masjids[st.masjidId].name) || 'मस्जिद' });
                    setActiveListeningMasjidId(st.masjidId);
                  }
                } else if (st.isLive === false) {
                  setLiveBroadcasts(prev => { if (!prev[st.masjidId]) return prev; const u = { ...prev }; delete u[st.masjidId]; return u; });
                  delete alertedSessionsRef.current[st.masjidId];
                  setActiveListeningMasjidId(p => (p === st.masjidId ? null : p));
                  setIncomingAzanAlert(p => (p && p.masjidId === st.masjidId ? null : p));
                }
              } catch (e) {}
            }
            if (topic === TOPIC_ADMIN_SETTINGS) {
              try {
                const sObj = JSON.parse(str);
                if (sObj && typeof sObj === 'object') {
                  setAdminSupport(prev => ({ ...prev, ...sObj }));
                  safeStorageSet('mc_admin_support', JSON.stringify(sObj));
                }
              } catch(e) {}
            }
            if (topic.startsWith(TOPIC_AUDIO_PREFIX)) {
              const mId = topic.slice(TOPIC_AUDIO_PREFIX.length);
              const isSelf = s.isImamLive || (s.loggedImamMasjidId && s.loggedImamMasjidId === mId);
              if (!isSelf && s.liveAzanOn && s.activeListeningMasjidId === mId && s.favorites.includes(mId)) azanStreamer.playLiveVoicePacket(str, 1.0);
            }
          };

          mqttClient.on('message', handleMessage);
          return () => {
            clearTimeout(republishTimer); clearTimeout(pruneTimer);
            mqttClient.removeListener('connect', handleConnect); mqttClient.removeListener('close', handleOffline);
            mqttClient.removeListener('offline', handleOffline); mqttClient.removeListener('message', handleMessage);
          };
        }, []);

        // Imam live ho to har 15 sec heartbeat
        useEffect(() => {
          if (!isImamLive || !loggedImamMasjidId) return;
          const id = setInterval(() => { azanStreamer.heartbeat(loggedImamMasjidId); setLiveBroadcasts(prev => ({ ...prev, [loggedImamMasjidId]: Date.now() })); }, 15000);
          return () => clearInterval(id);
        }, [isImamLive, loggedImamMasjidId]);

        // Imam live azan bhool jaye to 5 minute baad apne aap band
        useEffect(() => {
          if (!isImamLive || !loggedImamMasjidId) return;
          const id = loggedImamMasjidId;
          const timer = setTimeout(() => {
            azanStreamer.stopBroadcast(id); setIsImamLive(false);
            setLiveBroadcasts(prev => { const u = { ...prev }; delete u[id]; return u; });
            showToast('⏱️ 5 मिनट पूरे हुए, लाइव अज़ान अपने आप बंद हो गई');
          }, 5 * 60 * 1000);
          return () => clearTimeout(timer);
        }, [isImamLive, loggedImamMasjidId]);

        // Jis masjid ka heartbeat band ho gaya uska "LIVE" hata do
        useEffect(() => {
          const id = setInterval(() => {
            setLiveBroadcasts(prev => {
              const now = Date.now(); let changed = false; const u = {};
              Object.keys(prev).forEach(k => { if (now - prev[k] < LIVE_STALE_MS) u[k] = prev[k]; else changed = true; });
              return changed ? u : prev;
            });
          }, 10000);
          return () => clearInterval(id);
        }, []);

        // Page band hone par live band
        useEffect(() => {
          const stopOnLeave = () => { if (azanStreamer.isBroadcasting) azanStreamer.stopBroadcast(azanStreamer.masjidId); };
          window.addEventListener('beforeunload', stopOnLeave); window.addEventListener('pagehide', stopOnLeave);
          return () => { window.removeEventListener('beforeunload', stopOnLeave); window.removeEventListener('pagehide', stopOnLeave); };
        }, []);

        useEffect(() => { if (landingRoleChoice === 'muqtadi') handleFetchGpsLocation(true); }, []);

        const publishMasjidUpdate = (singleMasjidObj, isDelete = false, deletedId = null) => {
          setMasjids(prev => {
            const updated = { ...prev };
            if (isDelete) delete updated[deletedId]; else updated[singleMasjidObj.id] = singleMasjidObj;
            safeStorageSet('mc_db_v12', JSON.stringify(updated)); return updated;
          });
          // 1. Google Firebase Firestore Permanent Cloud Database
          if (firestoreDb) {
            try {
              if (isDelete && deletedId) {
                firestoreDb.collection('masjids').doc(deletedId).delete().catch(() => {});
              } else if (singleMasjidObj && singleMasjidObj.id) {
                firestoreDb.collection('masjids').doc(singleMasjidObj.id).set(singleMasjidObj, { merge: true }).catch(() => {});
              }
            } catch (e) {}
          }
          // 2. Realtime MQTT Broadcast
          if (mqttClient && mqttClient.connected) {
            if (isDelete) { mqttClient.publish(`${TOPIC_DB_PREFIX}${deletedId}`, "", { retain: true, qos: 1 }); mqttClient.publish(TOPIC_EVENTS, JSON.stringify({ type: 'MASJID_DELETED', deletedId }), { qos: 1 }); } 
            else mqttClient.publish(`${TOPIC_DB_PREFIX}${singleMasjidObj.id}`, JSON.stringify(singleMasjidObj), { retain: true, qos: 1 });
          }
        };

        const toggleFavorite = (id) => {
          const isCurrentlyFav = favorites.includes(id); const updated = isCurrentlyFav ? [] : [id];
          setFavorites(updated); safeStorageSet('mc_user_favorites', JSON.stringify(updated));
          
          const delta = isCurrentlyFav ? -1 : 1;
          setMasjids(prev => {
            const target = prev[id];
            if (!target) return prev;
            const cur = target.followersCount ?? target.favoritesCount ?? (isCurrentlyFav ? 1 : 0);
            const nextCount = Math.max(0, cur + delta);
            const updatedMasjid = { ...target, followersCount: nextCount, updatedAt: Date.now() };
            const updatedMap = { ...prev, [id]: updatedMasjid };
            safeStorageSet('mc_db_v12', JSON.stringify(updatedMap));
            if (firestoreDb) {
              try { firestoreDb.collection('masjids').doc(id).set({ followersCount: nextCount, updatedAt: Date.now() }, { merge: true }).catch(() => {}); } catch(e) {}
            }
            return updatedMap;
          });

          if (mqttClient && mqttClient.connected) {
            mqttClient.publish(TOPIC_EVENTS, JSON.stringify({ type: 'FAVORITE_COUNT_UPDATE', masjidId: id, delta }), { qos: 1 });
          }

          if (!isCurrentlyFav) { setSelectedMasjidId(id); safeStorageSet('mc_selected_masjid_id', id); setCurrentTab('home'); showToast('⭐ यह मस्जिद आपकी पसंदीदा बन गई!'); } 
          else { setSelectedMasjidId(null); localStorage.removeItem('mc_selected_masjid_id'); showToast('⭐ पसंदीदा हटा दी गई'); }
        };

        const allMasjidsWithDist = useMemo(() => {
          return Object.values(masjids).map(m => {
            // Check if mosque has a valid, real location saved by Imam
            const hasValidLoc = typeof m.lat === 'number' && !isNaN(m.lat) && typeof m.lng === 'number' && !isNaN(m.lng) && (m.lat !== 0 || m.lng !== 0) && (m.gpsVerified || m.lat !== 28.6139 || m.lng !== 77.2090);
            
            let dist = 999999;
            let distTxt = '';
            
            // Doori tabhi niklegi jab user ka real GPS ho aur masjid ki real location ho
            if (hasGps && userLocation && typeof userLocation.lat === 'number' && hasValidLoc) {
              dist = calculateDistanceKm(userLocation.lat, userLocation.lng, m.lat, m.lng);
              if (dist < 0.05) {
                distTxt = `${Math.max(10, Math.round(dist * 1000))} M`;
              } else if (dist < 1.0) {
                distTxt = `${Math.round(dist * 1000)} M`;
              } else {
                distTxt = `${dist.toFixed(1)} KM`;
              }
            }
            
            return {
              ...m,
              hasValidLocation: hasValidLoc,
              distanceKm: dist,
              distanceText: distTxt,
              isLive: !!liveBroadcasts[m.id],
              isFav: favorites.includes(m.id)
            };
          }).sort((a, b) => {
            // JIS MASJID KA IMAM LOCATION SAVE NAHI KIYA US KO LIST KE AAKHIR ME DEKHANA
            if (a.hasValidLocation && !b.hasValidLocation) return -1;
            if (!a.hasValidLocation && b.hasValidLocation) return 1;
            if (hasGps) {
              return a.distanceKm - b.distanceKm;
            }
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });
        }, [masjids, userLocation, hasGps, liveBroadcasts, favorites]);

        const masjidsWithin10Km = useMemo(() => {
          // GPS nahi milta to 10 KM wala filter hata kar poore desh ki masjidein KABHI nahi dikhana!
          if (!hasGps) return [];
          return allMasjidsWithDist.filter(m => m.hasValidLocation && m.distanceKm <= 10.0);
        }, [allMasjidsWithDist, hasGps]);

        const currentMasjid = useMemo(() => {
          const sel = selectedMasjidId ? allMasjidsWithDist.find(m => m.id === selectedMasjidId) : null; if (sel) return sel;
          const fav = allMasjidsWithDist.find(m => favorites.includes(m.id)); if (fav) return fav;
          if (loggedImamMasjidId && masjids[loggedImamMasjidId]) return allMasjidsWithDist.find(m => m.id === loggedImamMasjidId) || null;
          return null;
        }, [favorites, loggedImamMasjidId, masjids, allMasjidsWithDist, selectedMasjidId]);

        const allCombinedNotifications = useMemo(() => {
          const mNotifs = (currentMasjid && Array.isArray(currentMasjid.notifications)) ? currentMasjid.notifications.map(n => ({
            ...n,
            message: n.message || n.body,
            isAdmin: false,
            senderName: currentMasjid.name || 'मस्जिद'
          })) : [];

          const aNotifs = adminAnnouncements.map(a => ({
            ...a,
            message: a.message || a.body,
            isAdmin: true,
            senderName: a.senderName || 'मस्जिद कनेक्ट एडमिनिस्ट्रेटर'
          }));

          return [...aNotifs, ...mNotifs].sort((a, b) => (b.ts || 0) - (a.ts || 0));
        }, [currentMasjid, adminAnnouncements]);

        const unreadNotificationCount = useMemo(() => {
          return allCombinedNotifications.filter(n => !readNotificationIds.includes(n.id)).length;
        }, [allCombinedNotifications, readNotificationIds]);

        const ISLAMIC_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'];
        const getAutoCalculatedHijriDate = (targetMasjid, curDateObj = currentTime) => {
          if (!targetMasjid) return (getHijriToday() || '1 Muharram 1448'); const rawHijri = (targetMasjid.hijriDateStr || (getHijriToday() || '1 Muharram 1448')).trim();
          let baseDateStr = targetMasjid.lastDateSetISO || targetMasjid.registeredAtISO || '2026-10-31'; if (baseDateStr.length > 10) baseDateStr = baseDateStr.slice(0, 10);
          const curIso = (curDateObj instanceof Date ? curDateObj : new Date()).toISOString().slice(0, 10);
          const baseTime = new Date(baseDateStr + 'T00:00:00').getTime(); const curTime = new Date(curIso + 'T00:00:00').getTime();
          const elapsedDays = Math.max(0, Math.floor((curTime - baseTime) / (1000 * 60 * 60 * 24)));
          if (elapsedDays === 0) return rawHijri;
          const fullMatch = rawHijri.match(/^(\d{1,2})\s+([A-Za-z\s'\-]+?)(?:\s+(\d{4}))?$/);
          if (fullMatch) {
            let day = parseInt(fullMatch[1], 10) + elapsedDays; const rawMonth = fullMatch[2].trim(); let year = fullMatch[3] ? parseInt(fullMatch[3], 10) : 1448;
            let mIdx = ISLAMIC_MONTHS.findIndex(m => m.toLowerCase().replace(/[^a-z]/g, '') === rawMonth.toLowerCase().replace(/[^a-z]/g, ''));
            if (mIdx === -1) mIdx = 0; while (true) { const len = (mIdx % 2 === 0) ? 30 : 29; if (day <= len) break; day -= len; mIdx = (mIdx + 1) % 12; if (mIdx === 0) year += 1; }
            return `${day < 10 ? '0'+day : day} ${ISLAMIC_MONTHS[mIdx]} ${year}`;
          }
          const numMatch = rawHijri.match(/^(\d{1,2})(.*)$/);
          if (numMatch) { let day = parseInt(numMatch[1], 10) + elapsedDays; if (day > 30) day = ((day - 1) % 30) + 1; return `${day < 10 ? '0'+day : day}${numMatch[2]}`; }
          return rawHijri;
        };

        const handleSelectMuqtadiRole = () => { setLandingRoleChoice('muqtadi'); safeStorageSet('mc_user_role_choice', 'muqtadi'); handleFetchGpsLocation(false); };

        const handleExecuteImamLogin = (idInput, passInput) => {
          const cleanId = (idInput || '').trim().toUpperCase(); const cleanPass = (passInput || '').trim();
          if (!cleanId || !cleanPass) { setLoginError(true); return false; }
          const target = Object.values(masjids).find(m => (m.id && m.id.trim().toUpperCase() === cleanId));
          if (target && target.passcode === cleanPass) {
            setLoggedImamMasjidId(target.id); setSelectedMasjidId(target.id); setFavorites([target.id]);
            safeStorageSet('mc_logged_imam_masjid_id', target.id); safeStorageSet('mc_selected_masjid_id', target.id); safeStorageSet('mc_user_favorites', JSON.stringify([target.id]));
            setShowImamLoginModal(false); setLoginError(false); setLoginMasjidId(''); setLoginPasscode(''); setCurrentTab('profile'); showToast(`✅ इमाम लॉगिन सफल!`); return true;
          } else { if (!target && Object.keys(masjids).length === 0) showToast('⏳ डेटा सिंक हो रहा है, कुछ सेकंड बाद फिर कोशिश करें', 'error'); setLoginError(true); return false; }
        };

        const loggedImamMasjid = useMemo(() => { if (!loggedImamMasjidId) return null; return masjids[loggedImamMasjidId] || null; }, [loggedImamMasjidId, masjids]);

        const handleFetchGpsLocation = (silent = false) => {
          if (navigator.geolocation) {
            setIsFetchingGps(true);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setIsFetchingGps(false);
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setRegLat(loc.lat);
                setRegLng(loc.lng);
                setUserLocation(loc);
                setHasGps(true);
                safeStorageSet('mc_user_location', JSON.stringify(loc));
                if (!silent) showToast(`✅ सटीक लोकेशन प्राप्त हुई!`);
              },
              (err) => {
                setIsFetchingGps(false);
                if (!silent) {
                  if (err && err.code === 1) {
                    showToast('⚠️ लोकेशन परमिशन बंद है। कृपया परमिशन चालू करें।', 'error');
                  } else {
                    showToast('⚠️ GPS लोकेशन नहीं मिल सकी। कृपया फोन में GPS ऑन करें।', 'error');
                  }
                }
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
          } else {
            setIsFetchingGps(false);
            if (!silent) showToast('GPS उपलब्ध नहीं है।', 'error');
          }
        };

        const handleFetchEditGpsLocation = () => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => { setEditLat(pos.coords.latitude); setEditLng(pos.coords.longitude); showToast(`✅ सटीक लोकेशन प्राप्त हुई!`); },
              () => { showToast('GPS लोकेशन नहीं मिल सकी।', 'error'); }, { enableHighAccuracy: true, timeout: 5000 }
            );
          }
        };

        const checkIsRegionBanned = (m) => {
          if (!m) return false;
          if (m.isSuspended) return true;
          const bStates = Array.isArray(adminSupport?.bannedStates) ? adminSupport.bannedStates : [];
          const bDistricts = Array.isArray(adminSupport?.bannedDistricts) ? adminSupport.bannedDistricts : [];
          if (!bStates.length && !bDistricts.length) return false;

          const strip = (t) => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          const loc = strip(m.stateLocation);
          const st = strip(m.stateName);
          const addr = strip(m.address);

          // Check banned states
          for (const s of bStates) {
            const sk = strip(s);
            if (sk && (st.includes(sk) || sk.includes(st) || addr.includes(sk))) return true;
            if (sk === 'uttarpradesh' && (/\bup\b/i.test(m.stateName || '') || /\bup\b/i.test(m.address || ''))) return true;
          }
          // Check banned districts
          for (const d of bDistricts) {
            const dk = strip(d);
            if (dk && (loc.includes(dk) || dk.includes(loc) || addr.includes(dk))) return true;
          }
          return false;
        };

        const checkIsMasjidPremiumActive = (m) => {
          if (!m) return false;
          if (m.isSuspended) return false;
          if (checkIsRegionBanned(m)) return false;
          if (m.timeEditAllowed === false) return false;
          if (m.paymentStatus === 'free') return true;
          if (m.liveAzanAllowed === false) return false;
          if (m.paymentStatus === 'expired') return false;
          if (m.paymentExpiry) {
            const expTime = new Date(m.paymentExpiry + 'T23:59:59').getTime();
            if (!isNaN(expTime) && expTime < Date.now()) return false;
          }
          return true;
        };

        // 3 Distinct Service Categories per Masjid:
        // 1. Blue Tick (Verified Badge)
        const isBlueTickActive = (m) => {
          if (!m) return false;
          if (m.isSuspended || checkIsRegionBanned(m)) return false;
          if (m.services && typeof m.services.blueTick === 'boolean') return m.services.blueTick;
          if (typeof m.blueTickAllowed === 'boolean') return m.blueTickAllowed;
          if (typeof m.blueTick === 'boolean') return m.blueTick;
          const isPaidAll = !!adminSupport?.allMasjidsPaidMode;
          if (isPaidAll) {
            return (m.paymentStatus === 'free' || checkIsMasjidPremiumActive(m)) && !!m.isVerified;
          }
          return !!m.isVerified;
        };

        // 2. Live Azan Service (Audio Broadcast & Streaming)
        const isLiveAzanServiceActive = (m) => {
          if (!m) return false;
          if (m.isSuspended || checkIsRegionBanned(m)) return false;
          if (m.services && typeof m.services.liveAzan === 'boolean') return m.services.liveAzan;
          if (typeof m.liveAzanAllowed === 'boolean' && !m.liveAzanAllowed) return false;
          if (typeof m.liveAzan === 'boolean') return m.liveAzan;
          const isPaidAll = !!adminSupport?.allMasjidsPaidMode;
          if (isPaidAll) {
            return m.paymentStatus === 'free' || checkIsMasjidPremiumActive(m);
          }
          return m.liveAzanAllowed !== false && checkIsMasjidPremiumActive(m);
        };

        // 3. Profile ki saari services (Namaz Times, Hadith, Notice, Sehri/Iftar, Info, Profile edit/delete)
        const isProfileServicesActive = (m) => {
          if (!m) return false;
          if (m.isSuspended || checkIsRegionBanned(m)) return false;
          if (m.services && typeof m.services.profileServices === 'boolean') return m.services.profileServices;
          if (typeof m.profileServicesAllowed === 'boolean') return m.profileServicesAllowed;
          if (typeof m.profileServices === 'boolean') return m.profileServices;
          if (m.timeEditAllowed === false) return false;
          const isPaidAll = !!adminSupport?.allMasjidsPaidMode;
          if (isPaidAll) {
            return m.paymentStatus === 'free' || checkIsMasjidPremiumActive(m);
          }
          return m.timeEditAllowed !== false && checkIsMasjidPremiumActive(m);
        };

        const openPremiumPaywallModal = (m = null, serviceType = null) => {
          const target = m || loggedImamMasjid || masjids[loggedImamMasjidId];
          setPaywallTargetMasjid(target);
          setPaywallTargetService(serviceType || null);
          setPaymentUtrInput('');
          setPaymentDateTimeInput(new Date().toLocaleString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
          setShowPremiumPaywallModal(true);
        };

        const handleSubmitPaymentVerification = (e) => {
          e.preventDefault();
          const cleanUtr = paymentUtrInput.trim();
          if (!cleanUtr) { showToast('कृपया UTR / Transaction ID भरें!', 'error'); return; }
          const target = paywallTargetMasjid || loggedImamMasjid || masjids[loggedImamMasjidId];
          if (!target) return;

          const cleanDate = paymentDateTimeInput.trim() || new Date().toLocaleString('hi-IN');
          const currentPremFee = adminSupport.premiumFeeAmount || 499;
          const payReq = {
            id: 'pay_' + Date.now(),
            masjidId: target.id,
            masjidName: target.name,
            imamName: target.imamName || 'इमाम साहब',
            phone: target.phone || '',
            utr: cleanUtr,
            date: cleanDate,
            amount: currentPremFee,
            plan: 'yearly',
            requestedService: paywallTargetService || 'all',
            status: 'pending',
            timestamp: Date.now()
          };

          if (firestoreDb) {
            try {
              firestoreDb.collection('payment_requests').doc(payReq.id).set(payReq).catch(() => {});
              firestoreDb.collection('masjids').doc(target.id).set({
                paymentStatus: 'pending',
                pendingUtr: cleanUtr,
                pendingPaymentDate: cleanDate,
                pendingService: paywallTargetService || 'all',
                updatedAt: Date.now()
              }, { merge: true }).catch(() => {});
            } catch(e) {}
          }

          if (mqttClient && mqttClient.connected) {
            mqttClient.publish(TOPIC_EVENTS, JSON.stringify({ type: 'PAYMENT_VERIFICATION_SUBMITTED', request: payReq }), { qos: 1 });
            mqttClient.publish(`${TOPIC_DB_PREFIX}payment_requests`, JSON.stringify(payReq), { retain: true, qos: 1 });
          }

          setShowPremiumPaywallModal(false);
          setPaymentUtrInput('');
          showToast('✅ धन्यवाद! UTR एडमिन को सत्यापन के लिए भेज दिया गया है।');
        };

        const handleStartLiveAzan = async (masjidId) => {
          const m = loggedImamMasjid || masjids[masjidId];
          if (m && checkIsRegionBanned(m)) {
            showToast('🚫 आपका क्षेत्र या मस्जिद व्यवस्थापक द्वारा प्रतिबंधित (Banned / Suspended) है।', 'error');
            return;
          }
          if (!isLiveAzanServiceActive(m)) {
            openPremiumPaywallModal(m, 'liveAzan');
            return;
          }
          azanStreamer.initContext(); const res = await azanStreamer.startBroadcast(masjidId);
          if (res.success) { setIsImamLive(true); setLiveBroadcasts(prev => ({ ...prev, [masjidId]: Date.now() })); } else showToast(res.error, 'error');
        };
        const handleStopLiveAzan = (masjidId) => { azanStreamer.stopBroadcast(masjidId); setIsImamLive(false); setLiveBroadcasts(prev => { const u = { ...prev }; delete u[masjidId]; return u; }); };

        const executeDeleteMasjidProfile = () => {
          if (!loggedImamMasjidId || !loggedImamMasjid) return;
          if (deletePasswordInput.trim() !== loggedImamMasjid.passcode) { showToast('❌ गलत पासवर्ड!', 'error'); return; }
          publishMasjidUpdate(null, true, loggedImamMasjidId); 
          setLoggedImamMasjidId(null); localStorage.removeItem('mc_logged_imam_masjid_id'); 
          setFavorites(prev => { const nextFavs = prev.filter(x => x !== loggedImamMasjidId); safeStorageSet('mc_user_favorites', JSON.stringify(nextFavs)); return nextFavs; });
          if (selectedMasjidId === loggedImamMasjidId) { setSelectedMasjidId(null); localStorage.removeItem('mc_selected_masjid_id'); }
          setShowDeleteSafetyModal(false); setDeletePasswordInput(''); setCurrentTab('home'); showToast(`✅ मस्जिद मिटा दी गई!`);
        };

        const handleSaveProfileEdit = (e) => {
          e.preventDefault(); if (!loggedImamMasjidId) return; const target = masjids[loggedImamMasjidId]; if (!target) return;
          const form = e.target;
          const newIdClean = ((form.mNewId && form.mNewId.value) || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
          const newPassClean = ((form.mNewPass && form.mNewPass.value) || '').trim();
          const curPassInput = ((form.mCurPass && form.mCurPass.value) || '').trim();
          const idChanged = !!newIdClean && newIdClean !== String(target.id).toUpperCase();
          const passChanged = !!newPassClean && newPassClean !== target.passcode;
          if (idChanged || passChanged) {
            if (curPassInput !== target.passcode) { showToast('❌ ID/पासवर्ड बदलने के लिए "मौजूदा पासवर्ड" सही लिखें', 'error'); return; }
            if (passChanged && newPassClean.length < 3) { showToast('❌ पासवर्ड कम से कम 3 अक्षर का हो', 'error'); return; }
            if (idChanged) {
              const curIdClean = String(target.id).trim().toUpperCase();
              const isDuplicate = Object.keys(masjids).some(k => k.trim().toUpperCase() === newIdClean && k.trim().toUpperCase() !== curIdClean) ||
                                  Object.values(masjids).some(m => m.id && m.id.trim().toUpperCase() === newIdClean && m.id.trim().toUpperCase() !== curIdClean);
              if (isDuplicate) { showToast('❌ यह ID पहले से किसी और मस्जिद की है! आप किसी दूसरी मस्जिद की ID नहीं रख सकते', 'error'); return; }
              if (isImamLive) { showToast('❌ पहले लाइव अज़ान बंद करें', 'error'); return; }
              if (!(mqttClient && mqttClient.connected)) { showToast('❌ ID बदलने के लिए इंटरनेट/क्लाउड कनेक्शन चाहिए', 'error'); return; }
            }
          }
          const finalId = idChanged ? newIdClean : target.id;
          const finalPass = passChanged ? newPassClean : target.passcode;
          
          const finalLat = parseFloat(editLat) || target.lat || 28.6139;
          const finalLng = parseFloat(editLng) || target.lng || 77.2090;

          const updatedMasjid = {
            ...target, name: form.mName.value.trim(), address: form.mAddress.value.trim(), stateLocation: form.mCity.value.trim(), stateName: (form.mState ? form.mState.value.trim() : ''),
            phone: form.mPhone.value.trim(), imamName: form.mImam.value.trim(), 
            photo: editPhotoUrl || target.photo, 
            lat: finalLat, lng: finalLng, id: finalId, passcode: finalPass, updatedAt: Date.now()
          };
          if (idChanged) {
            const oldId = target.id;
            setMasjids(prev => { const u = { ...prev }; delete u[oldId]; u[finalId] = updatedMasjid; safeStorageSet('mc_db_v12', JSON.stringify(u)); return u; });
            if (firestoreDb) {
              try {
                firestoreDb.collection('masjids').doc(oldId).delete().catch(() => {});
                firestoreDb.collection('masjids').doc(finalId).set(updatedMasjid).catch(() => {});
              } catch(e) {}
            }
            if (mqttClient && mqttClient.connected) {
              mqttClient.publish(`${TOPIC_DB_PREFIX}${oldId}`, "", { retain: true, qos: 1 });
              mqttClient.publish(`${TOPIC_DB_PREFIX}${finalId}`, JSON.stringify(updatedMasjid), { retain: true, qos: 1 });
              mqttClient.publish(TOPIC_EVENTS, JSON.stringify({ type: 'MASJID_ID_CHANGED', oldId, newId: finalId }), { qos: 1 });
            }
            setLoggedImamMasjidId(finalId); safeStorageSet('mc_logged_imam_masjid_id', finalId);
            setSelectedMasjidId(prev => { if (prev !== oldId) return prev; safeStorageSet('mc_selected_masjid_id', finalId); return finalId; });
            setFavorites(prev => { const n = prev.map(x => (x === oldId ? finalId : x)); safeStorageSet('mc_user_favorites', JSON.stringify(n)); return n; });
            setShowEditProfileModal(false); showToast(`✅ प्रोफाइल अपडेट! नई ID: ${finalId}`);
          } else { publishMasjidUpdate(updatedMasjid); setShowEditProfileModal(false); showToast('मस्जिद की प्रोफाइल अपडेट हो गई!'); }
        };

        const infoMasjid = infoMasjidId ? masjids[infoMasjidId] : null;
        const openMasjidInfo = (id, from) => { setInfoMasjidId(id); setInfoBackTab(from || 'home'); setCurrentTab('info'); };
        const openInfoEdit = () => {
          const m = masjids[loggedImamMasjidId];
          if (!m) return;
          if (!isProfileServicesActive(m)) {
            openPremiumPaywallModal(m, 'profileServices');
            return;
          }
          const inf = m.info || {};
          setInfoDraft({ ...inf, facilities: [...(inf.facilities || [])] });
          setShowInfoEditModal(true);
        };
        const setD = (k, v) => setInfoDraft(prev => ({ ...prev, [k]: v }));
        const toggleFacility = (f) => setInfoDraft(prev => { const cur = prev.facilities || []; return { ...prev, facilities: cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f] }; });
        const handleQrUpload = (e) => {
          const file = e.target.files && e.target.files[0]; if (!file) return;
          compressImageFile(file, 400, 0.70).then((url) => { setD('upiQr', url); showToast('✅ QR फोटो सेलेक्ट हुई'); }).catch(() => showToast('फ़ोटो नहीं खुल सकी', 'error'));
        };
        const handleSaveInfo = (e) => {
          e.preventDefault(); const target = masjids[loggedImamMasjidId]; if (!target) return;
          const clean = {}; Object.keys(infoDraft).forEach(k => { const v = infoDraft[k]; clean[k] = typeof v === 'string' ? v.trim() : v; });
          publishMasjidUpdate({ ...target, info: clean, updatedAt: Date.now() });
          setShowInfoEditModal(false); showToast('✅ जानकारी सेव हो गई');
        };
        const toggleLiveAzanPref = () => {
          const next = !liveAzanOn; setLiveAzanOn(next); safeStorageSet('mc_live_azan_on', next ? '1' : '0');
          if (next) { azanStreamer.initContext(); showToast('🔔 लाइव अज़ान ON: अज़ान शुरू होते ही आवाज़ आएगी'); }
          else { setActiveListeningMasjidId(null); setIncomingAzanAlert(null); showToast('🔕 लाइव अज़ान OFF: अब लाइव अज़ान नहीं सुनाई देगी'); }
        };
        const build30DaysTimetable = (baseStartDate, sSehri, sIftar, progressive = true) => {
          const list = [];
          const today = new Date();
          let startYear = today.getFullYear();
          let startMonth = today.getMonth();
          let startDay = today.getDate();

          if (baseStartDate && typeof baseStartDate === 'string' && baseStartDate.includes('-')) {
            const parts = baseStartDate.split('-').map(Number);
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
              startYear = parts[0];
              startMonth = parts[1] - 1;
              startDay = parts[2];
            }
          }

          const baseSehri = sSehri || '04:45';
          const baseIftar = sIftar || '17:50';

          for (let i = 0; i < 30; i++) {
            const d = new Date(startYear, startMonth, startDay + i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${day}`;

            // Ramadan progression: Sehri shifts ~0.7 min earlier per day, Iftar shifts ~0.6 min later per day
            const sehriShift = progressive ? -Math.round(i * 0.7) : 0;
            const iftarShift = progressive ? +Math.round(i * 0.6) : 0;

            list.push({
              day: i + 1,
              date: dateStr,
              sehri: addMinutesToTime(baseSehri, sehriShift),
              iftar: addMinutesToTime(baseIftar, iftarShift)
            });
          }
          return list;
        };

        const smartRamadan = useMemo(() => {
          return getSmartRamadanState(currentMasjid || loggedImamMasjid, currentTime, build30DaysTimetable);
        }, [currentMasjid, loggedImamMasjid, currentTime]);

        const openRamzanEdit = () => {
          const m = masjids[loggedImamMasjidId]; if (!m) return;
          if (!isProfileServicesActive(m)) {
            openPremiumPaywallModal(m, 'profileServices');
            return;
          }
          const sr = getSmartRamadanState(m, currentTime, build30DaysTimetable);
          setRamzanDraft({
            sehri: sr.todaySehri24 || sr.baseSehri24 || '04:45',
            iftar: sr.todayIftar24 || sr.baseIftar24 || '17:50',
            startDate: sr.startDateIso,
            moonConfirmed: sr.isMoonConfirmed,
            days: sr.daysList
          });
          setShowRamzanEditModal(true);
        };

        const handleSaveRamzan = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          const target = masjids[loggedImamMasjidId]; if (!target) return;
          const isConfirmed = !!ramzanDraft.moonConfirmed;
          const todayIso = toLocalIso(new Date());
          const extraHijriSync = {};
          if (isConfirmed && ramzanDraft.startDate === todayIso) {
            const hp = hijriParts(new Date());
            extraHijriSync.hijriDateStr = `01 Ramadan ${(hp && hp.y) ? hp.y : 1448}`;
            extraHijriSync.lastDateSetISO = todayIso;
          }
          publishMasjidUpdate({
            ...target,
            ...extraHijriSync,
            ramzan: {
              sehri: ramzanDraft.sehri,
              iftar: ramzanDraft.iftar,
              startDate: ramzanDraft.startDate,
              moonConfirmed: isConfirmed,
              confirmedStartDate: isConfirmed ? ramzanDraft.startDate : '',
              confirmedRozaCount: 30,
              days: ramzanDraft.days,
              updatedAt: Date.now()
            },
            updatedAt: Date.now()
          });
          setShowRamzanEditModal(false);
          showToast(isConfirmed ? '🌙 चाँद कन्फर्म व 30 दिन का पक्का कैलेंडर सेव हो गया!' : '✅ संभावित सहरी व इफ़्तार कैलेंडर सेव हो गया');
        };

        const handleStartDateChange = (newDateStr) => {
          setRamzanDraft(prev => {
            const today = new Date();
            let startYear = today.getFullYear();
            let startMonth = today.getMonth();
            let startDay = today.getDate();

            if (newDateStr && typeof newDateStr === 'string' && newDateStr.includes('-')) {
              const parts = newDateStr.split('-').map(Number);
              if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                startYear = parts[0];
                startMonth = parts[1] - 1;
                startDay = parts[2];
              }
            }

            const currentDays = Array.isArray(prev.days) && prev.days.length === 30 ? prev.days : [];
            const nextDays = [];
            for (let i = 0; i < 30; i++) {
              const d = new Date(startYear, startMonth, startDay + i);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const dateStr = `${y}-${m}-${day}`;
              const existing = currentDays[i] || {};
              nextDays.push({
                day: i + 1,
                date: dateStr,
                sehri: existing.sehri || prev.sehri || '04:45',
                iftar: existing.iftar || prev.iftar || '18:15'
              });
            }

            return {
              ...prev,
              startDate: newDateStr,
              days: nextDays
            };
          });
        };

        const handleDayTimeChange = (idx, field, val) => {
          setRamzanDraft(prev => {
            const nextDays = (prev.days || []).map((d, i) => i === idx ? { ...d, [field]: val } : d);
            return { ...prev, days: nextDays };
          });
        };
        const requestAllPermissions = async () => {
          safeStorageSet('mc_perm_asked', '1'); setShowPermModal(false);
          try { azanStreamer.initContext(); } catch (e) {}
          try { if (window.Notification && Notification.permission === 'default') await Notification.requestPermission(); } catch (e) {}
          try { await new Promise((res) => { if (!navigator.geolocation) return res(); navigator.geolocation.getCurrentPosition((pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setHasGps(true); safeStorageSet('mc_user_location', JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })); res(); }, () => res(), { enableHighAccuracy: true, timeout: 12000 }); }); } catch (e) {}
          try { if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(tr => tr.stop()); } } catch (e) {}
        };
        const complaintCard = () => {
          const A = ADMIN_SUPPORT;
          const card = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-amber-300'} p-3.5 rounded-2xl border shadow-xs`;
          return (
            <div className={`${card} flex flex-col gap-2.5`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">💬</span>
                <div>
                  <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">शिकायत व सुझाव (Help & Feedback)</h3>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400">ऐप में कोई समस्या, सुझाव या नई मस्जिद जोड़ने में मदद चाहिए?</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">हेल्पलाइन: <span className="font-mono text-emerald-800 dark:text-emerald-300 font-black">{A.phone || '8084329613'}</span></span>
                <button type="button" onClick={() => copyText(A.phone || '8084329613')} className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border text-slate-700 dark:text-slate-200 font-bold active:scale-95 transition">📋 कॉपी</button>
              </div>
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => openNativeWhatsApp(A.whatsapp || '918084329613', 'السلام عليكم Admin Bhai, Mujhe Masjid Connect app ke baare me baat karni hai / sujhaao ya shikayat hai:')}
                  className="flex-1 min-h-[42px] rounded-xl bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1caa51] text-white font-extrabold text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
                  <span>WhatsApp पर मैसेज</span>
                </button>
                <a
                  href={`tel:${A.phone || '8084329613'}`}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-[13px] flex items-center justify-center gap-1 active:scale-95 transition"
                >
                  <span>📞 कॉल</span>
                </a>
              </div>
            </div>
          );
        };
        const supportCard = () => {
          const A = ADMIN_SUPPORT;
          const card = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-amber-300'} p-3.5 rounded-2xl border shadow-xs`;
          return (
            <div className={`${card} flex flex-col gap-2.5`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">💝</span>
                <div>
                  <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">सर्वर खर्च में सहयोग (Server Support)</h3>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400">यह ऐप सभी मस्जिदों के लिए 100% मुफ़्त है। सर्वर व मैसेजिंग खर्च में ऐच्छिक सहयोग दें:</p>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/60 p-2.5 rounded-xl text-center border dark:border-slate-600">
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block font-medium">Admin UPI ID:</span>
                <span className="font-mono text-[13.5px] font-black text-emerald-800 dark:text-emerald-300 break-all select-all">{A.upiId || '8084329613@upi'}</span>
              </div>
              <div className="flex gap-2 w-full">
                <a href={upiLink(A.upiId || '8084329613@upi', 'Masjid Connect Server Support')} className="flex-1 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shadow-xs active:scale-95 transition">💳 Donate via UPI</a>
                <button type="button" onClick={() => copyText(A.upiId || '8084329613@upi')} className="flex-1 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center active:scale-95 transition">📋 UPI ID कॉपी</button>
              </div>
            </div>
          );
        };
        const infoField = (label, key, placeholder, type, isTime = false) => (
          <div className="relative">
            <input
              type={type || 'text'}
              value={infoDraft[key] || ''}
              onChange={(e) => setD(key, e.target.value)}
              placeholder={`${isTime ? '🕒 ' : ''}${label}${placeholder ? ` (${placeholder})` : ''}`}
              className={`w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 ${isTime ? 'pl-8' : ''}`}
            />
            {isTime && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🕒</span>}
          </div>
        );

        const handleImamChangePassword = (e) => {
            e.preventDefault();
            if(newPassword !== confirmPassword) { showToast('पासवर्ड मेल नहीं खाते!', 'error'); return; }
            if(newPassword.length < 3) { showToast('पासवर्ड छोटा है!', 'error'); return; }
            const target = masjids[loggedImamMasjidId]; if (!target) return;
            publishMasjidUpdate({ ...target, passcode: newPassword, updatedAt: Date.now() });
            setShowChangePasswordModal(false); setNewPassword(''); setConfirmPassword(''); showToast('✅ पासवर्ड बदल दिया गया है!');
        };

        const openEditTimeModal = (targetMasjid = null) => {
          const m = targetMasjid || loggedImamMasjid || masjids[loggedImamMasjidId]; if (!m) return;
          if (checkIsRegionBanned(m)) {
            showToast('🚫 आपका क्षेत्र या मस्जिद व्यवस्थापक द्वारा प्रतिबंधित (Banned / Suspended) है।', 'error');
            return;
          }
          if (!isProfileServicesActive(m)) {
            openPremiumPaywallModal(m, 'profileServices');
            return;
          }
          setEditSchedule(normSchedule(m.schedule));
          setEditEnglishDate(m.englishDateStr || currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }));
          setEditHijriDate(getAutoCalculatedHijriDate(m, currentTime));
          setShowEditTimeModal(true);
        };

        const handleSaveScheduleInstant = (e) => {
          e.preventDefault(); if (!loggedImamMasjidId) return; const target = masjids[loggedImamMasjidId]; if (!target) return;
          if (checkIsRegionBanned(target) || target.timeEditAllowed === false) {
            showToast('🚫 प्रतिबंध लागू होने के कारण औक़ात सेव नहीं किए जा सकते।', 'error');
            return;
          }
          publishMasjidUpdate({ ...target, englishDateStr: editEnglishDate.trim(), hijriDateStr: editHijriDate.trim(), lastDateSetISO: new Date().toISOString().slice(0, 10), schedule: { ...editSchedule }, updatedAt: Date.now() });
          setShowEditTimeModal(false); showToast('✅ औक़ात अपडेट हो गए!');
        };

        const handleSaveHadithInstant = (e) => {
          e.preventDefault(); if (!loggedImamMasjidId || !editHadithText.trim()) return; const target = masjids[loggedImamMasjidId]; if (!target) return;
          publishMasjidUpdate({ ...target, dailyHadith: editHadithText.trim(), dailyHadithRef: editHadithRef.trim(), updatedAt: Date.now() });
          setShowEditHadithModal(false); showToast('आज की हदीस अपडेट हो गई!');
        };

        const handlePostNotice = (e) => {
          e.preventDefault(); if (!loggedImamMasjidId || !newNoticeTitle.trim() || !newNoticeMessage.trim()) return; const target = masjids[loggedImamMasjidId]; if (!target) return;
          const newNotice = { id: 'n_' + Date.now(), title: newNoticeTitle.trim(), message: newNoticeMessage.trim(), date: formatNoticeDateTime(new Date()), category: 'general' };
          publishMasjidUpdate({ ...target, notifications: [newNotice, ...(target.notifications || [])].slice(0, 20), updatedAt: Date.now() });
          setNewNoticeTitle(''); setNewNoticeMessage(''); setShowNewNoticeModal(false); showToast('ऐलान भेज दिया गया!');
        };

        const handleImamLogout = () => {
          if (isImamLive && loggedImamMasjidId) { azanStreamer.stopBroadcast(loggedImamMasjidId); setIsImamLive(false); setLiveBroadcasts(prev => { const u = { ...prev }; delete u[loggedImamMasjidId]; return u; }); }
          setLoggedImamMasjidId(null); localStorage.removeItem('mc_logged_imam_masjid_id');
          setShowEditProfileModal(false); setShowChangePasswordModal(false); setShowEditTimeModal(false); setShowEditHadithModal(false); setShowNewNoticeModal(false); setShowDeleteSafetyModal(false);
          setCurrentTab('profile'); showToast('✅ लॉगआउट हो गया');
        };

        const shareMasjidWhatsApp = (m) => {
          if (!m) return;
          const s = m.schedule || defaultSchedule; const f = (k) => t12(k, s[k], DEFAULT_SCHEDULE[k]);
          const place = [m.address, m.stateLocation, m.stateName].filter(Boolean).join(', ');
          const parts = [
            `🕌 ${m.name}`, `📍 ${place}`, '',
            '🕒 नमाज़ के औक़ात:',
            `ख़त्म-ए-सहरी: ${f('khatmSehri')}`, `Fajr: ${f('fajr')} (जमात ${f('fajrJamat')})`, `Zuhr: ${f('zuhr')} (जमात ${f('zuhrJamat')})`, `Asr: ${f('asr')} (जमात ${f('asrJamat')})`,
            `Maghrib: ${f('maghrib')} (जमात ${f('maghribJamat')})`, `Isha: ${f('isha')} (जमात ${f('ishaJamat')})`, `Juma: ${f('jumaAzan')} (जमात ${f('jumaJamat')})`,
            m.dailyHadith ? `\n📖 आज की हदीस:\n${m.dailyHadith}${m.dailyHadithRef ? ' ' + m.dailyHadithRef : ''}` : null,
            APP_SHARE_LINK ? `\n📲 ऐप का लिंक: ${APP_SHARE_LINK}` : null
          ];
          const shareText = parts.filter(x => x !== null).join('\n');
          const waAppUrl = `whatsapp://send?text=${encodeURIComponent(shareText)}`;
          const waWebUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
          try {
            // Mobile par seedha WhatsApp App khulega (browser nahi khulega)
            window.location.href = waAppUrl;
          } catch (e) {
            window.open(waWebUrl, '_blank');
          }
        };

        const handleSendResetRequest = (m) => {
          if (!m) return;

          // 0. Banned Mosque Check
          const isMosqueBanned = Boolean(m.isBanned || m.isSuspended || (typeof checkIsRegionBanned === 'function' && checkIsRegionBanned(m)));
          if (isMosqueBanned) {
            showToast('⚠️ सुरक्षा कारणों से यह मस्जिद आईडी अस्थायी रूप से लॉक है। एडमिन से संपर्क करें।', 'error');
            return;
          }

          // Rate Limiting Check: Max 3 requests per 24 hours per masjid
          const now = Date.now();
          const oneDayAgo = now - 24 * 60 * 60 * 1000;
          const userResetHistoryKey = `mc_reset_log_${m.id}`;
          let history = [];
          try {
            history = JSON.parse(safeStorageGet(userResetHistoryKey, '[]')).filter(ts => ts > oneDayAgo);
          } catch (e) { history = []; }

          if (history.length >= 3) {
            showToast('⛔ आज के लिए आपकी 3 रिक्वेस्ट पूरी हो चुकी हैं। कृपया 24 घंटे बाद कोशिश करें।', 'error');
            return;
          }

          // Save new timestamp in history
          history.push(now);
          safeStorageSet(userResetHistoryKey, JSON.stringify(history));

          // 1. LOGIN FORM AUTO-FILL & SCREEN TRANSITION
          setLoginMasjidId(m.id);
          setShowForgotCredentialsModal(false);
          setCurrentTab('profile');

          // 2. ADMIN KO REALTIME NOTIFICATION (Firestore + MQTT)
          const reqItem = {
            id: 'req_' + Date.now(),
            masjidId: m.id,
            masjidName: m.name,
            phone: m.phone,
            passcode: m.passcode || '786',
            date: formatNoticeDateTime(new Date()),
            timestamp: Date.now(),
            ts: Date.now(),
            status: 'pending'
          };
          const next = [reqItem, ...passwordResetRequests.filter(r => r.masjidId !== m.id)];
          setPasswordResetRequests(next);
          safeStorageSet('mc_pwd_resets', JSON.stringify(next));

          if (firestoreDb) {
            try { firestoreDb.collection('password_resets').doc(reqItem.id).set(reqItem, { merge: true }); } catch (e) {}
          }

          try {
            if (mqttClient && mqttClient.connected) {
              mqttClient.publish(`${TOPIC_DB_PREFIX}admin_reset_requests`, JSON.stringify(reqItem), { qos: 1 });
              mqttClient.publish(`${TOPIC_DB_PREFIX}resets`, JSON.stringify(reqItem), { qos: 1 });
            }
          } catch (e) {}

          // 3. SHOW CONFIRMATION NOTICE (2-3 Minute WhatsApp Delivery)
          setResetSuccessNotice({
            masjidName: m.name,
            masjidId: m.id,
            phone: m.phone
          });
          showToast(`✅ अनुरोध प्राप्त हुआ! 2-3 मिनट में पासवर्ड भेज दिया जाएगा।`);
        };

        const handleRefresh = () => {
          setIsRefreshing(true);
          setPullDistance(52);
          if (navigator.vibrate) {
            try { navigator.vibrate(35); } catch (e) {}
          }

          // 1. Fresh sync from Firestore
          if (firestoreDb) {
            try {
              firestoreDb.collection('masjids').get({ source: 'server' }).then((snapshot) => {
                setMasjids(prev => {
                  const next = { ...prev };
                  snapshot.forEach(doc => {
                    next[doc.id] = { id: doc.id, ...doc.data() };
                  });
                  safeStorageSet('mc_db_v12', JSON.stringify(next));
                  return next;
                });
              }).catch(() => {});
            } catch (e) {}
          }

          // 2. Refresh GPS Location
          if (hasGps) {
            handleFetchGpsLocation(true);
          }

          // 3. Update current time
          setCurrentTime(new Date());

          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
            showToast('✅ ताज़ा डेटा सफलतापूर्वक अपडेट हो गया!');
          }, 700);
        };

        const handleTouchStart = (e) => {
          if (isRefreshing) return;
          const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
          if (currentScroll <= 2) {
            touchStartYRef.current = e.touches[0].clientY;
            isPullingRef.current = true;
          } else {
            isPullingRef.current = false;
          }
        };

        const handleTouchMove = (e) => {
          if (!isPullingRef.current || isRefreshing) return;
          const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
          if (currentScroll > 2) {
            isPullingRef.current = false;
            setPullDistance(0);
            return;
          }
          const currentY = e.touches[0].clientY;
          const diff = currentY - touchStartYRef.current;
          if (diff > 0) {
            const pull = Math.min(80, Math.pow(diff, 0.82));
            setPullDistance(pull);
          } else {
            setPullDistance(0);
          }
        };

        const handleTouchEnd = () => {
          if (!isPullingRef.current || isRefreshing) return;
          isPullingRef.current = false;
          if (pullDistance >= 46) {
            handleRefresh();
          } else {
            setPullDistance(0);
          }
        };

        return (
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`max-w-md mx-auto min-h-screen ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-[#eef4f0] text-slate-800'} flex flex-col shadow-2xl relative font-sans pb-20`}
          >
            {/* PULL DOWN REFRESH INDICATOR */}
            <div 
              style={{ 
                height: `${pullDistance}px`, 
                transition: isPullingRef.current ? 'none' : 'height 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
                opacity: pullDistance > 6 ? 1 : 0
              }}
              className="w-full overflow-hidden flex items-center justify-center bg-emerald-950/15 dark:bg-emerald-400/10 text-emerald-900 dark:text-emerald-200 select-none"
            >
              <div className="flex items-center gap-2 text-xs font-extrabold py-2">
                <span 
                  className={`inline-block transition-transform duration-200 text-sm ${isRefreshing ? 'animate-spin' : pullDistance >= 46 ? 'rotate-180' : ''}`}
                >
                  {isRefreshing ? '🔄' : '↓'}
                </span>
                <span>
                  {isRefreshing ? 'डेटा रीफ्रेश हो रहा है...' : pullDistance >= 46 ? 'छोड़ें और रीफ्रेश करें' : 'नीचे खींचें और रीफ्रेश करें'}
                </span>
              </div>
            </div>
            
            {/* IN-APP TOAST */}
            {toast && (
              <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2 max-w-[90%] sm:max-w-md ${toast.type === 'error' ? 'bg-rose-600 text-white border-rose-700' : 'bg-[#07382c] text-white border-emerald-400'}`}>
                <span>{toast.type === 'error' ? '⚠️' : '✅'}</span><span className="leading-tight">{toast.message}</span>
                <button onClick={() => setToast(null)} className="ml-auto pl-2 text-white/80 hover:text-white text-sm font-black">✕</button>
              </div>
            )}

            {/* HEADER */}
            <header className="bg-[#07382c] text-white px-3 py-4 rounded-b-2xl shadow-md relative z-10 border-b border-amber-500/20">
              {currentMasjid ? (
                <div className="flex items-center gap-2.5 w-full min-w-0">
                  {/* Square Profile Photo with Gold Border */}
                  <div className="w-[70px] h-[85px] rounded-xl overflow-hidden border-2 border-amber-400 shrink-0 shadow-lg bg-emerald-950 relative">
                    <img src={currentMasjid.photo || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} alt={currentMasjid.name} className="w-full h-full object-cover" />
                    {currentMasjid.isLive && <span className="absolute inset-0 bg-rose-600/40 flex justify-center items-center text-[10px] font-black animate-pulse">LIVE</span>}
                  </div>

                  {/* Center Title (3-line layout) */}
                  <div className="flex-1 min-w-0 pr-1 -mt-1.5 flex flex-col justify-center">
                    {/* Line 1: Mosque Name + Small Star Toggle without background */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h1 className="font-masjid text-xl sm:text-2xl font-black uppercase text-amber-300 tracking-wide truncate drop-shadow-sm leading-tight flex items-center gap-1.5">
                        <span className="truncate">{currentMasjid.name}</span>
                        {isBlueTickActive(currentMasjid) && <VerifiedBadge size="lg" />}
                      </h1>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(currentMasjid.id)}
                        className="bg-transparent border-0 p-0 text-amber-400 hover:text-amber-300 transition shrink-0 active:scale-90 focus:outline-none"
                        title={favorites.includes(currentMasjid.id) ? "पसंदीदा से हटाएं" : "पसंदीदा बनाएं"}
                      >
                        <svg className={`w-5 h-5 ${favorites.includes(currentMasjid.id) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-white/80 stroke-current'}`} viewBox="0 0 24 24">
                          <path strokeWidth="2" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </button>
                    </div>

                    {/* Line 2: Mohalla / Address (Clean white text - larger font) */}
                    <div className="text-[12.5px] sm:text-[13px] font-bold text-white tracking-wide uppercase truncate mt-0.5 leading-snug">
                      {currentMasjid.address || 'मोहल्ला'}
                    </div>

                    {/* Line 3: City / State (Mint-green text - larger font) */}
                    <div className="text-[11.5px] sm:text-[12px] text-emerald-200 font-semibold truncate leading-snug mt-0.5">
                      {currentMasjid.stateLocation || currentMasjid.stateName || 'स्थान'}
                    </div>
                  </div>

                  {/* Right Action Icons: ONLY 2 ICONS (Notification Bell + Theme Toggle) - Enlarged & Balanced */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <button onClick={() => { 
                      const unread = allCombinedNotifications.filter(n => !readNotificationIds.includes(n.id)); 
                      setNotifModalItems(unread); 
                      if (unread.length > 0) { 
                        const u = Array.from(new Set([...readNotificationIds, ...unread.map(n => n.id)])); 
                        setReadNotificationIds(u); 
                        safeStorageSet('mc_read_notifs', JSON.stringify(u)); 
                      } 
                      setShowNotificationsModal(true); 
                    }} aria-label="सूचनाएं" className="w-[35px] h-[35px] rounded-full bg-white/15 flex justify-center items-center relative hover:bg-white/25 active:scale-95 transition shadow-sm">
                      <svg className="w-[18px] h-[18px] text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                      {unreadNotificationCount > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-rose-600 text-[9px] font-black flex items-center justify-center animate-pulse px-0.5 border border-[#07382c] shadow">{unreadNotificationCount}</span>}
                    </button>
                    <button onClick={toggleDarkMode} className="w-[35px] h-[35px] rounded-full bg-white/15 text-base flex justify-center items-center hover:bg-white/25 active:scale-95 transition shadow-sm">{darkMode ? '☀️' : '🎨'}</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-emerald-900 border-2 border-amber-400 flex justify-center items-center text-xl">🕌</div><div><h1 className="text-sm font-black uppercase">मस्जिद कनेक्ट</h1><p className="text-[10px] text-amber-200">स्मार्ट लाइव नेटवर्क</p></div></div>
                  <button onClick={toggleDarkMode} className="w-[35px] h-[35px] rounded-full bg-white/15 text-base flex items-center justify-center hover:bg-white/25 active:scale-95 transition">{darkMode ? '☀️' : '🎨'}</button>
                </div>
              )}
            </header>

            {currentMasjid && currentMasjid.isLive && (
              <div className="mx-3 mt-1.5 z-20 bg-rose-600 text-white rounded-xl p-2 px-3 shadow-lg flex justify-between items-center border border-rose-300">
                <div className="flex items-center gap-2"><div className="flex gap-1"><span className="w-1 bg-white rounded-full wave-bar-1" /><span className="w-1 bg-white rounded-full wave-bar-2" /><span className="w-1 bg-white rounded-full wave-bar-3" /></div><div><h4 className="font-black text-xs">🔴 लाइव अज़ान चालू है!</h4></div></div>
                {!isImamLive && liveAzanOn && <button onClick={() => { azanStreamer.initContext(); if (activeListeningMasjidId === currentMasjid.id) setActiveListeningMasjidId(null); else { setActiveListeningMasjidId(currentMasjid.id); azanStreamer.playMelodicAlarm(); } }} className={`px-2.5 py-1 rounded-lg font-black text-[11px] shadow transition ${activeListeningMasjidId === currentMasjid.id ? 'bg-white text-emerald-800' : 'bg-white text-rose-700 animate-pulse'}`}>{activeListeningMasjidId === currentMasjid.id ? '🔊 चालू है' : '🔊 सुनें'}</button>}
              </div>
            )}
            
            {incomingAzanAlert && (!currentMasjid || currentMasjid.id !== incomingAzanAlert.masjidId) && (
              <div className="mx-3 mt-1.5 z-20 bg-rose-600 text-white rounded-xl p-2 px-3 shadow-lg flex justify-between items-center animate-bounce border border-rose-300">
                <div className="flex items-center gap-2"><span className="text-lg">📢</span><div><h4 className="font-black text-xs">🔴 {incomingAzanAlert.masjidName} से लाइव अज़ान चालू है!</h4></div></div>
                <button onClick={() => { setSelectedMasjidId(incomingAzanAlert.masjidId); setActiveListeningMasjidId(incomingAzanAlert.masjidId); setCurrentTab('home'); }} className="px-2.5 py-1 rounded-lg font-black text-[11px] bg-white text-rose-700 shadow">सुनें</button>
              </div>
            )}

            {currentMasjid && checkIsRegionBanned(currentMasjid) && (
              <div className="mx-3 mt-1.5 z-20 bg-rose-700 text-white rounded-2xl p-3 shadow-lg flex items-start gap-2.5 border border-rose-400 animate-in fade-in">
                <span className="text-xl shrink-0">🚫</span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-xs">यह मस्जिद या क्षेत्र एडमिन द्वारा प्रतिबंधित (Banned) है</h4>
                  <p className="text-[10px] text-rose-100 mt-0.5 leading-tight">एडमिन द्वारा इस क्षेत्र या मस्जिद पर अस्थायी रोक लगाई गई है। लाइव अज़ान और औक़ात बदलाव सुविधाएँ निष्क्रिय हैं।</p>
                </div>
              </div>
            )}


            {/* TAB 1: HOME */}
            {currentTab === 'home' && window.HomeTabFeature && (
              <window.HomeTabFeature
                currentMasjid={currentMasjid}
                landingRoleChoice={landingRoleChoice}
                masjids={masjids}
                masjidsWithin10Km={masjidsWithin10Km}
                hasGps={hasGps}
                isInitialSyncing={isInitialSyncing}
                isFetchingGps={isFetchingGps}
                darkMode={darkMode}
                currentTime={currentTime}
                liveAzanOn={liveAzanOn}
                allCombinedNotifications={allCombinedNotifications}
                smartRamadan={smartRamadan}
                setShowRegisterModal={setShowRegisterModal}
                handleSelectMuqtadiRole={handleSelectMuqtadiRole}
                setCurrentTab={setCurrentTab}
                handleFetchGpsLocation={handleFetchGpsLocation}
                showToast={showToast}
                toggleFavorite={toggleFavorite}
                openMasjidInfo={openMasjidInfo}
                toggleLiveAzanPref={toggleLiveAzanPref}
                shareMasjidWhatsApp={shareMasjidWhatsApp}
                isBlueTickActive={isBlueTickActive}
                getAutoCalculatedHijriDate={getAutoCalculatedHijriDate}
                T={T}
                VerifiedBadge={VerifiedBadge}
                FavButton={FavButton}
                InfoButton={InfoButton}
                RouteButton={RouteButton}
                NamazProgressBar={NamazProgressBar}
              />
            )}

            {/* TAB 2: NEARBY */}
            {currentTab === 'nearby' && window.NearbyTabFeature && (
              <window.NearbyTabFeature
                currentMasjid={currentMasjid}
                masjids={masjids}
                masjidsWithin10Km={masjidsWithin10Km}
                allMasjidsWithDist={allMasjidsWithDist}
                hasGps={hasGps}
                isInitialSyncing={isInitialSyncing}
                isFetchingGps={isFetchingGps}
                darkMode={darkMode}
                setSelectedMasjidId={setSelectedMasjidId}
                setCurrentTab={setCurrentTab}
                safeStorageSet={safeStorageSet}
                handleFetchGpsLocation={handleFetchGpsLocation}
                showToast={showToast}
                toggleFavorite={toggleFavorite}
                openMasjidInfo={openMasjidInfo}
                isBlueTickActive={isBlueTickActive}
                VerifiedBadge={VerifiedBadge}
                FavButton={FavButton}
                InfoButton={InfoButton}
                RouteButton={RouteButton}
              />
            )}

            {/* TAB 4: PROFILE */}
            {currentTab === 'profile' && window.ImamProfileFeature && (
              <window.ImamProfileFeature
                loggedImamMasjid={loggedImamMasjid}
                favorites={favorites}
                darkMode={darkMode}
                isImamLive={isImamLive}
                adminSupport={adminSupport}
                loginMasjidId={loginMasjidId}
                setLoginMasjidId={setLoginMasjidId}
                loginPasscode={loginPasscode}
                setLoginPasscode={setLoginPasscode}
                loginError={loginError}
                setLoginError={setLoginError}
                smartRamadan={smartRamadan}
                isBlueTickActive={isBlueTickActive}
                isProfileServicesActive={isProfileServicesActive}
                isLiveAzanServiceActive={isLiveAzanServiceActive}
                openPremiumPaywallModal={openPremiumPaywallModal}
                openEditTimeModal={openEditTimeModal}
                setEditHadithText={setEditHadithText}
                setEditHadithRef={setEditHadithRef}
                setShowEditHadithModal={setShowEditHadithModal}
                openRamzanEdit={openRamzanEdit}
                setShowNewNoticeModal={setShowNewNoticeModal}
                openInfoEdit={openInfoEdit}
                setEditPhotoUrl={setEditPhotoUrl}
                setEditLat={setEditLat}
                setEditLng={setEditLng}
                setShowEditProfileModal={setShowEditProfileModal}
                handleImamLogout={handleImamLogout}
                setDeletePasswordInput={setDeletePasswordInput}
                setShowDeleteSafetyModal={setShowDeleteSafetyModal}
                handleStopLiveAzan={handleStopLiveAzan}
                handleStartLiveAzan={handleStartLiveAzan}
                handleExecuteImamLogin={handleExecuteImamLogin}
                setShowForgotCredentialsModal={setShowForgotCredentialsModal}
                setShowRegisterModal={setShowRegisterModal}
                VerifiedBadge={VerifiedBadge}
              />
            )}

            {/* ================= JANKARI (ABOUT MASJID) PAGE ================= */}
            {currentTab === 'info' && (
              <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
                <button onClick={() => { if (favorites.length > 0) { setSelectedMasjidId(favorites[0]); safeStorageSet('mc_selected_masjid_id', favorites[0]); } setCurrentTab(infoBackTab || 'home'); }} className="flex items-center gap-1 text-xs font-bold text-emerald-700 min-h-[40px]">← वापस</button>
                {!infoMasjid ? (
                  <div className="p-6 text-center text-xs text-slate-500">मस्जिद नहीं मिली।</div>
                ) : (() => {
                  const m = infoMasjid; const inf = m.info || {}; const card = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-3.5 rounded-2xl border`;
                  const anyMore = inf.maktabHas || inf.jumaKhutba || inf.eidTime || inf.taraweeh || (inf.facilities || []).length || inf.committeeName || inf.committeePhone || inf.upiQr || inf.upiId;
                  return (
                    <div className="space-y-3">
                      <div className={`${card} flex flex-col items-center text-center gap-1.5`}>
                        <img src={m.photo || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} alt={m.name} className="w-[88px] h-[88px] rounded-full object-cover border-[3px] border-amber-400 shadow" />
                        <h2 className="font-masjid text-2xl leading-tight text-[#07382c] dark:text-emerald-300 break-words flex items-center justify-center gap-1.5 flex-wrap">
                          <span>{m.name}</span>
                          {isBlueTickActive(m) && <VerifiedBadge size="lg" />}
                        </h2>
                        <p className="text-[12px] text-slate-500 break-words">📍 {m.address}{m.stateLocation ? `, ${m.stateLocation}` : ''}{m.stateName ? `, ${m.stateName}` : ''}</p>
                        {(m.imamName || m.phone) && <div className="w-full h-px bg-slate-200 dark:bg-slate-700 my-1.5"></div>}
                        {m.imamName && <><div className="text-[11px] text-slate-500">इमाम साहब</div><div className="text-base font-bold">{m.imamName}</div></>}
                        <div className="flex flex-wrap gap-2 justify-center mt-1">
                          {m.phone && <a href={`tel:${m.phone}`} className="min-h-[44px] px-5 rounded-full bg-[#07382c] text-white font-bold text-sm flex items-center gap-2"><svg className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.4-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" /></svg>{m.phone}</a>}
                          <button type="button" onClick={() => openNativeGoogleMaps(m)} className="min-h-[44px] px-5 rounded-full bg-amber-400 hover:bg-amber-500 active:scale-95 text-slate-900 font-bold text-sm flex items-center gap-1.5 shadow-sm transition"><span>🧭 Google Maps (रास्ता देखें)</span></button>
                        </div>
                      </div>

                      {/* 1. MUTAWALLI / COMMITTEE DETAILS FIRST */}
                      {(inf.committeeName || inf.committeePhone) && (
                        <div className={`${card} flex justify-between items-center gap-3`}>
                          <div><div className="text-[11px] text-slate-500 font-bold">Committee / Mutawalli</div><div className="font-bold text-[15px]">{inf.committeeName || '—'}</div></div>
                          {inf.committeePhone && <a href={`tel:${inf.committeePhone}`} className="min-h-[44px] px-4 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-emerald-900 dark:text-emerald-300 font-bold text-[13px] flex items-center">📞 {inf.committeePhone}</a>}
                        </div>
                      )}

                      {/* 2. CHANDA (UPI) & QR CODE SECOND */}
                      {(inf.upiQr || inf.upiId) && (
                        <div className={`${card} flex flex-col items-center gap-2.5`}>
                          <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300 self-start">💝 Masjid Donation / QR (UPI)</h3>
                          {inf.upiQr && <button onClick={() => setQrFull(inf.upiQr)} aria-label="View QR Full Screen" className="bg-white p-2 rounded-2xl border"><img src={inf.upiQr} alt="UPI QR" className="w-44 h-44 object-contain" /></button>}
                          {inf.upiQr && <button onClick={() => setQrFull(inf.upiQr)} className="min-h-[40px] px-5 rounded-full bg-amber-400 text-slate-900 font-bold text-[13px]">🔍 View QR Full Screen</button>}
                          {inf.upiId && (
                            <div className="w-full flex flex-col items-center gap-2">
                              <div className="font-mono text-[13px] break-all text-center">{inf.upiId}</div>
                              <div className="flex gap-2 w-full">
                                <button onClick={() => copyText(inf.upiId)} className="flex-1 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-[13px]">📋 Copy UPI ID</button>
                                <a href={upiLink(inf.upiId, m.name)} className="flex-1 min-h-[44px] rounded-xl bg-[#07382c] text-white font-bold text-[13px] flex items-center justify-center">Pay via UPI</a>
                              </div>
                            </div>
                          )}
                          <p className="text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">Please verify mosque name and receiver before sending donation.</p>
                        </div>
                      )}

                      {/* 3. REST OF INFORMATION: MAKTAB, SPECIAL PRAYERS, FACILITIES */}
                      {inf.maktabHas === 'no' && <div className={`${card} text-[13px] text-slate-600 dark:text-slate-300`}>🏫 No Maktab in this mosque.</div>}
                      {inf.maktabHas === 'yes' && (
                        <div className={card}>
                          <div className="flex justify-between items-center"><h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">🏫 Maktab</h3><span className="text-[11px] font-bold bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-full">Available</span></div>
                          <div className="space-y-2 mt-2.5">
                            <InfoRow label="Timing" value={inf.maktabTime} />
                            <InfoRow label="Fee" value={inf.maktabFee} />
                            <InfoRow label="Classes" value={inf.maktabClasses} />
                            <InfoRow label="Teacher" value={inf.ustaadName} />
                          </div>
                          {inf.ustaadPhone && <a href={`tel:${inf.ustaadPhone}`} className="mt-2.5 min-h-[40px] px-4 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-emerald-900 dark:text-emerald-300 font-bold text-[13px] inline-flex items-center">📞 Call Teacher: {inf.ustaadPhone}</a>}
                        </div>
                      )}

                      {(inf.jumaKhutba || inf.eidTime || inf.taraweeh) && (
                        <div className={card}>
                          <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">🕌 Special Prayers</h3>
                          <div className="space-y-2 mt-2.5">
                            <InfoRow label="Juma Khutba" value={inf.jumaKhutba} />
                            <InfoRow label="Eid Prayer" value={inf.eidTime} />
                            <InfoRow label="Taraweeh" value={inf.taraweeh} />
                          </div>
                        </div>
                      )}

                      {(inf.facilities || []).length > 0 && (
                        <div className={card}>
                          <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">✅ Facilities</h3>
                          <div className="flex flex-wrap gap-2 mt-2.5">{inf.facilities.map(f => <span key={f} className="text-[12px] font-semibold bg-amber-100 text-amber-900 px-3 py-1.5 rounded-full">{f}</span>)}</div>
                        </div>
                      )}

                      {!anyMore && (
                        <div className={`${card} text-center text-[12px] text-slate-500`}>No additional information provided yet.{loggedImamMasjidId === m.id && <button onClick={openInfoEdit} className="block mx-auto mt-2 px-4 py-2 bg-[#07382c] text-white rounded-xl font-bold text-xs">ℹ️ Edit Information</button>}</div>
                      )}
                    </div>
                  );
                })()}
              </main>
            )}
            {/* ================= MORE PAGE (DYNAMIC PLUGIN LOADER) ================= */}
            {currentTab === 'more' && (
              <main className="px-3.5 py-4 flex-1 z-0 pb-24">
                <div className="mb-3">
                  <h2 className="font-masjid text-2xl text-[#07382c] dark:text-emerald-300">More</h2>
                  <p className="text-xs text-slate-500">इबादत और ऐप की सारी सुविधाएं एक जगह</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(window.APP_FEATURES || []).map(x => (
                    <button key={x.id} onClick={() => setCurrentTab(x.id)} className={`${x.bg} text-slate-900 border rounded-[22px] p-3 min-h-[155px] flex flex-col items-center justify-center gap-2 text-center active:scale-95 transition shadow-xs`}>
                      <span className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${x.badge}`}>{x.icon}</span>
                      <span className="text-[16px] font-bold leading-tight">{x.title}</span>
                      <span className="text-[11.5px] text-slate-600">{x.sub}</span>
                    </button>
                  ))}
                  <button onClick={() => setCurrentTab('about')} className="bg-[#f4f0e6] border-[#d9d2c3] text-slate-900 border rounded-[22px] p-3 min-h-[155px] flex flex-col items-center justify-center gap-2 text-center active:scale-95 transition shadow-xs">
                    <span className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-[#4b4333] text-stone-100">ℹ️</span>
                    <span className="text-[16px] font-bold leading-tight">ऐप के बारे में</span>
                    <span className="text-[11.5px] text-slate-600">जानकारी और गाइड</span>
                  </button>
                  <button onClick={() => setShowFeedbackModal(true)} className="bg-[#eef2ff] border-[#c7d2fe] text-slate-900 border rounded-[22px] p-3 min-h-[155px] flex flex-col items-center justify-center gap-2 text-center active:scale-95 transition shadow-xs">
                    <span className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-[#3730a3] text-indigo-100">💬</span>
                    <span className="text-[16px] font-bold leading-tight">शिकायत व सुझाव</span>
                    <span className="text-[11.5px] text-slate-600">Help & Feedback</span>
                  </button>
                  <button onClick={() => setShowServerSupportModal(true)} className="bg-[#fdf2f8] border-[#fbcfe8] text-slate-900 border rounded-[22px] p-3 min-h-[155px] flex flex-col items-center justify-center gap-2 text-center active:scale-95 transition shadow-xs">
                    <span className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-[#9d174d] text-pink-100">💝</span>
                    <span className="text-[16px] font-bold leading-tight">सर्वर सहयोग</span>
                    <span className="text-[11.5px] text-slate-600">Server Expense Support</span>
                  </button>
                </div>
              </main>
            )}

            {/* ================= AUTO-RENDER ANY ACTIVE FEATURE FROM registry.js ================= */}
            {(() => {
              const activePlugin = (window.APP_FEATURES || []).find(f => f.id === currentTab);
              if (!activePlugin) return null;
              return activePlugin.render({
                currentMasjid,
                currentTime,
                userLocation,
                hasGps,
                onGps: () => handleFetchGpsLocation(false),
                darkMode,
                onBack: () => setCurrentTab('more'),
                t12,
                normSchedule,
                build30DaysTimetable,
                isBlueTickActive,
                VerifiedBadge,
                safeStorageGet,
                safeStorageSet,
                showToast,
                smartRamadan,
                loggedImamMasjidId,
                onOpenRamzanEdit: openRamzanEdit
              });
            })()}
            {/* ================= ABOUT APP ================= */}
            {currentTab === 'about' && (() => {
              const card = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-3.5 rounded-2xl border`;
              const A = ADMIN_SUPPORT;
              return (
                <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
                  <button onClick={() => setCurrentTab('more')} className="flex items-center gap-1 text-xs font-bold text-emerald-700 min-h-[40px]">← More</button>
                  <div className={`${card} text-center`}>
                    <div className="w-16 h-16 mx-auto rounded-full bg-[#07382c] border-2 border-amber-400 flex items-center justify-center text-3xl">🕌</div>
                    <h2 className="font-masjid text-2xl mt-2 text-[#07382c] dark:text-emerald-300">मस्जिद कनेक्ट</h2>
                    <div className="text-[11px] text-slate-500">{APP_VERSION}</div>
                    <p className="text-[13px] leading-relaxed mt-2">इमाम और नमाज़ियों के बीच सीधा, लाइव डिजिटल रिश्ता। जमाअत का वक़्त, हिजरी तारीख़, मस्जिद के ऐलान और घर बैठे लाइव अज़ान, सब एक जगह।</p>
                  </div>
                  <div className={card}>
                    <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">👥 मुक़्तदी कैसे इस्तेमाल करें</h3>
                    <ol className="list-decimal pl-5 mt-2 space-y-1 text-[13px]"><li>"मैं मुक़्तदी हूँ" चुनें और लोकेशन की इजाज़त दें।</li><li>10 KM की मस्जिदों की लिस्ट से अपनी मस्जिद ⭐ पसंद करें।</li><li>ℹ️ जानकारी से मकतब, इमाम का नंबर और चंदा देखें।</li><li>🧭 रास्ता दबाकर Google Maps से पहुँचें।</li></ol>
                  </div>
                  <div className={card}>
                    <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">🕌 इमाम कैसे इस्तेमाल करें</h3>
                    <ol className="list-decimal pl-5 mt-2 space-y-1 text-[13px]"><li>Profile में "नई मस्जिद रजिस्टर करें" से मस्जिद जोड़ें।</li><li>मस्जिद ID और पासवर्ड संभालकर रखें, इसी से लॉगिन होगा।</li><li>"समय" से अज़ान/जमाअत का वक़्त बदलें, सब के फोन में तुरंत बदल जाएगा।</li><li>"जानकारी और चंदा सेट करें" से मकतब, सुविधाएं और UPI QR डालें।</li><li>🎙️ लाइव अज़ान चालू करें, पसंदीदा करने वालों को सायरन और आवाज़ मिलेगी।</li></ol>
                  </div>
                  <div className={card}>
                    <h3 className="font-extrabold text-[15px] text-[#07382c] dark:text-emerald-300">🔒 निजता</h3>
                    <p className="text-[13px] mt-1.5">ऐप सिर्फ़ आपकी लोकेशन से पास की मस्जिदें और क़िब्ले की दिशा दिखाता है। मुक़्तदी के लिए रजिस्ट्रेशन या लॉगिन नहीं है।</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowFeedbackModal(true)}
                      className="p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition min-h-[58px]"
                    >
                      <span className="text-lg">💬</span>
                      <span>शिकायत व सुझाव</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowServerSupportModal(true)}
                      className="p-3 rounded-2xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 text-pink-900 dark:text-pink-200 border border-pink-200 dark:border-pink-800 font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition min-h-[58px]"
                    >
                      <span className="text-lg">💝</span>
                      <span>सर्वर सहयोग</span>
                    </button>
                  </div>
                </main>
              );
            })()}

            {/* BOTTOM NAV */}
            <nav className={`fixed bottom-0 left-0 right-0 z-[100] ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border-t max-w-md mx-auto py-2 px-6 flex justify-between shadow-lg`}>
              <button onClick={() => { if (favorites.length > 0) { setSelectedMasjidId(favorites[0]); safeStorageSet('mc_selected_masjid_id', favorites[0]); } setCurrentTab('home'); }} className={`flex flex-col items-center gap-0.5 text-[11px] font-bold pb-1 relative ${currentTab === 'home' ? 'text-emerald-700' : 'text-slate-400'}`}><svg className="w-5 h-5" fill={currentTab === 'home' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg><span>Home</span></button>
              <button onClick={() => { if (favorites.length > 0) { setSelectedMasjidId(favorites[0]); safeStorageSet('mc_selected_masjid_id', favorites[0]); } setCurrentTab('nearby'); }} className={`flex flex-col items-center gap-0.5 text-[11px] font-bold pb-1 relative ${currentTab === 'nearby' ? 'text-emerald-700' : 'text-slate-400'}`}><svg className="w-5 h-5" fill={currentTab === 'nearby' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg><span>Nearby</span></button>
              <button onClick={() => { if (favorites.length > 0) { setSelectedMasjidId(favorites[0]); safeStorageSet('mc_selected_masjid_id', favorites[0]); } setCurrentTab('more'); }} className={`flex flex-col items-center gap-0.5 text-[11px] font-bold pb-1 relative ${['more', 'tasbih', 'ramzan', 'qibla', 'about', 'qaza'].includes(currentTab) ? 'text-emerald-700' : 'text-slate-400'}`}><svg className="w-5 h-5" fill={['more', 'tasbih', 'ramzan', 'qibla', 'about', 'qaza'].includes(currentTab) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></svg><span>More</span></button>
              <button onClick={() => { if (favorites.length > 0) { setSelectedMasjidId(favorites[0]); safeStorageSet('mc_selected_masjid_id', favorites[0]); } setCurrentTab('profile'); }} className={`flex flex-col items-center gap-0.5 text-[11px] font-bold pb-1 relative ${currentTab === 'profile' ? 'text-emerald-700' : 'text-slate-400'}`}><svg className="w-5 h-5" fill={currentTab === 'profile' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg><span>Profile</span></button>
            </nav>

            {/* MODALS */}

            {/* QAZA CUSTOM DAYS MODAL */}
            {showCustomDaysModal && (
              <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4 animate-in fade-in">
                <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white'} rounded-3xl p-5 max-w-xs w-full space-y-3.5 shadow-2xl`}>
                  <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                    <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-slate-900 dark:text-white">
                      <span>✏️</span>
                      <span>दिनों की संख्या दर्ज करें</span>
                    </h3>
                    <button onClick={() => { setShowCustomDaysModal(false); setCustomDaysInput(''); }} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold">✕</button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                      कितने दिनों की क़ज़ा जोड़नी है?
                    </label>
                    <input 
                      type="number" 
                      min="1" 
                      max="36500"
                      value={customDaysInput}
                      onChange={(e) => setCustomDaysInput(e.target.value)}
                      placeholder="उदा: 15, 40 या 100"
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-mono font-bold text-base"
                      autoFocus
                    />
                    <p className="text-[10.5px] text-slate-400">सभी 6 नमाज़ों (फ़ज्र, ज़ुहर, अस्र, मगरिब, ईशा, वित्र) में इतने दिन जुड़ जाएँगे।</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowCustomDaysModal(false); setCustomDaysInput(''); }} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold">
                      रद्द करें
                    </button>
                    <button onClick={() => setBulkQazaDays(customDaysInput)} className="flex-1 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold shadow-md active:scale-95 transition">
                      जोड़ें
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* NAMAZ TRACKER PROFILE MODAL */}
            {showTrackerProfileModal && (
              <div className="fixed inset-0 z-[350] bg-black/60 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl border dark:border-slate-700 animate-in fade-in zoom-in-95`}>
                  <div className="flex items-center justify-between border-b pb-2.5 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm font-bold">
                        👤
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-[#07382c] dark:text-emerald-300">नमाज़ ट्रैकर प्रोफ़ाइल</h3>
                        <p className="text-[11px] text-slate-400">नाम व इलाक़ा सेट करें</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowTrackerProfileModal(false)}
                      className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold hover:bg-slate-200"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-bold block text-slate-600 dark:text-slate-300 mb-1">आपका नाम (Muqtadi Name):</label>
                      <input 
                        type="text" 
                        value={trackerNameInput}
                        onChange={(e) => setTrackerNameInput(e.target.value)}
                        placeholder="e.g. Md Shahid Hussain"
                        className="w-full p-2.5 rounded-xl border dark:border-slate-600 dark:bg-slate-700/60 font-semibold"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="font-bold block text-slate-600 dark:text-slate-300 mb-1">इलाक़ा / गाँव / मोहल्ला (Location):</label>
                      <input 
                        type="text" 
                        value={trackerPlaceInput}
                        onChange={(e) => setTrackerPlaceInput(e.target.value)}
                        placeholder="e.g. Jhirwa Purwari"
                        className="w-full p-2.5 rounded-xl border dark:border-slate-600 dark:bg-slate-700/60 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button 
                      onClick={() => setShowTrackerProfileModal(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-95 transition"
                    >
                      रद्द करें
                    </button>
                    <button 
                      onClick={saveTrackerProfile}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-md active:scale-95 transition"
                    >
                      💾 सेव करें
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PERMISSION (pehli baar) */}
            {showPermModal && (
              <div className="fixed inset-0 z-[400] bg-black/70 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl`}>
                  <h3 className="font-masjid text-xl text-[#07382c] dark:text-emerald-300">ज़रूरी इजाज़तें</h3>
                  <p className="text-[12px] text-slate-500">ऐप ठीक से चलाने के लिए ये इजाज़तें चाहिए:</p>
                  <ul className="space-y-2 text-[13px]">
                    <li>📍 <b>लोकेशन:</b> पास की मस्जिदें दिखाने के लिए</li>
                    <li>🎙️ <b>माइक्रोफ़ोन:</b> इमाम की लाइव अज़ान के लिए</li>
                    <li>🔔 <b>सूचनाएं:</b> लाइव अज़ान और ऐलान बताने के लिए</li>
                    <li>🖼️ <b>गैलरी:</b> फ़ोटो चुनते समय फ़ोन खुद इजाज़त पूछेगा</li>
                  </ul>
                  <button onClick={requestAllPermissions} className="w-full min-h-[46px] rounded-xl bg-[#07382c] text-white font-bold text-sm">✅ इजाज़त दें</button>
                  <button onClick={() => { safeStorageSet('mc_perm_asked', '1'); setShowPermModal(false); }} className="w-full min-h-[40px] text-[12px] text-slate-500">बाद में</button>
                </div>
              </div>
            )}

            {/* SEHRI / IFTAR & 30-DAY TIMETABLE EDIT MODAL (imam) */}
            {showRamzanEditModal && loggedImamMasjid && (
              <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-3 sm:p-4">
                <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} rounded-3xl p-4 sm:p-5 max-w-md w-full shadow-2xl border dark:border-slate-700 max-h-[92vh] flex flex-col`}>
                  <div className="flex justify-between items-center border-b pb-2.5 dark:border-slate-700 shrink-0">
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-[#07382c] dark:text-emerald-300">🌙 Sehri & Iftar 30-Day Timetable</h3>
                      <p className="text-[11px] text-slate-500">Edit Ramadan & monthly fasting timetable for Muqtadis</p>
                    </div>
                    <button type="button" onClick={() => setShowRamzanEditModal(false)} aria-label="Close" className="text-xl p-1 text-slate-400 hover:text-slate-600">✕</button>
                  </div>

                  <form onSubmit={handleSaveRamzan} className="space-y-3 pt-3 flex-1 flex flex-col overflow-hidden text-xs">
                    {/* MOON CONFIRMATION CARD */}
                    <div className={`p-3 rounded-2xl border space-y-2 shrink-0 ${ramzanDraft.moonConfirmed ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-black text-xs text-slate-900 dark:text-white block">
                            {ramzanDraft.moonConfirmed ? '✅ रमज़ान का चाँद कन्फर्म है' : '🌙 रमज़ान चाँद कन्फर्मेशन'}
                          </span>
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 block leading-snug">
                            {ramzanDraft.moonConfirmed ? 'पक्का कैलेंडर और होम पेज काउंटडाउन चालू है' : 'चाँद दिखने पर कन्फर्म दबाएं, वरना संभावित दिखेगा'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRamzanDraft(p => ({ ...p, moonConfirmed: !p.moonConfirmed }))}
                          className={`px-3 py-1.5 rounded-xl font-black text-[11px] shadow-xs active:scale-95 transition shrink-0 ${
                            ramzanDraft.moonConfirmed
                              ? 'bg-emerald-700 text-white'
                              : 'bg-amber-500 text-slate-950'
                          }`}
                        >
                          {ramzanDraft.moonConfirmed ? '✓ कन्फर्म (बदलें)' : '🌙 चाँद कन्फर्म करें'}
                        </button>
                      </div>
                      {!ramzanDraft.moonConfirmed && (
                        <div className="flex gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              const t = new Date();
                              const tomorrowIso = toLocalIso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
                              handleStartDateChange(tomorrowIso);
                              setRamzanDraft(p => ({ ...p, moonConfirmed: true }));
                            }}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-[#07382c] text-amber-300 font-bold text-[10.5px] active:scale-95 transition"
                          >
                            🌙 आज चाँद दिखा (कल से 1st रोज़ा)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const todayIso = toLocalIso(new Date());
                              handleStartDateChange(todayIso);
                              setRamzanDraft(p => ({ ...p, moonConfirmed: true }));
                            }}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-400 text-emerald-800 dark:text-emerald-300 font-bold text-[10.5px] active:scale-95 transition"
                          >
                            📅 आज से 1st रोज़ा
                          </button>
                        </div>
                      )}
                    </div>

                    {/* TOP SETUP CARD: START DATE & BASE TIMINGS */}
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 space-y-2 shrink-0">
                      <div className="flex items-center justify-between gap-2">
                        <label className="font-bold text-[11px] text-slate-600 dark:text-slate-300 shrink-0">Month / Start Date:</label>
                        <input
                          type="date"
                          value={ramzanDraft.startDate || ''}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          className="p-1 px-2 rounded-lg border bg-white dark:bg-slate-800 text-xs font-bold outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 border rounded-xl p-2 bg-white dark:bg-slate-800">
                          <span className="text-sm">🌙</span>
                          <span className="font-bold text-[11px] text-slate-600 dark:text-slate-300 shrink-0">Default Sehri:</span>
                          <input
                            type="time"
                            required
                            value={ramzanDraft.sehri || '04:45'}
                            onChange={(e) => setRamzanDraft(p => ({ ...p, sehri: e.target.value }))}
                            className="flex-1 bg-transparent text-xs font-mono font-bold outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 border rounded-xl p-2 bg-white dark:bg-slate-800">
                          <span className="text-sm">🌇</span>
                          <span className="font-bold text-[11px] text-slate-600 dark:text-slate-300 shrink-0">Default Iftar:</span>
                          <input
                            type="time"
                            required
                            value={ramzanDraft.iftar || '18:15'}
                            onChange={(e) => setRamzanDraft(p => ({ ...p, iftar: e.target.value }))}
                            className="flex-1 bg-transparent text-xs font-mono font-bold outline-none"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRamzanDraft(p => ({
                          ...p,
                          days: build30DaysTimetable(p.startDate, p.sehri || '04:45', p.iftar || '17:50', true)
                        }))}
                        className="w-full py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 font-extrabold text-[10.5px] active:scale-95 transition"
                      >
                        🔄 ऊपर दिए समय से पूरे 30 दिन की टेबल ऑटो-भरें
                      </button>
                    </div>

                    {/* 30-DAY EDITABLE ROWS */}
                    <div className="flex-1 min-h-0 flex flex-col border rounded-2xl overflow-hidden border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-[38px_1fr_1fr_1fr] text-[10.5px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-slate-700/80 p-2 border-b dark:border-slate-600">
                        <span>Day</span>
                        <span>Date</span>
                        <span>Sehri End</span>
                        <span>Iftar</span>
                      </div>
                      <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 flex-1">
                        {(ramzanDraft.days || []).map((d, idx) => (
                          <div key={idx} className="grid grid-cols-[38px_1fr_1fr_1fr] text-[11px] p-1.5 px-2 items-center hover:bg-slate-50 dark:hover:bg-slate-750">
                            <span className="font-bold text-slate-600 dark:text-slate-400 text-xs">#{d.day}</span>
                            <span className="font-mono text-[10.5px] truncate text-slate-700 dark:text-slate-300 pr-1">{d.date ? d.date.slice(5) : ''}</span>
                            <input
                              type="time"
                              value={d.sehri || '04:45'}
                              onChange={(e) => handleDayTimeChange(idx, 'sehri', e.target.value)}
                              className="w-full p-0.5 rounded bg-white dark:bg-slate-800 border text-[11px] font-mono font-bold outline-none"
                            />
                            <input
                              type="time"
                              value={d.iftar || '18:15'}
                              onChange={(e) => handleDayTimeChange(idx, 'iftar', e.target.value)}
                              className="w-full p-0.5 ml-1 rounded bg-white dark:bg-slate-800 border text-[11px] font-mono font-bold outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* FOOTER BUTTONS */}
                    <div className="flex gap-2 pt-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowRamzanEditModal(false)}
                        className="w-1/2 min-h-[42px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="w-1/2 min-h-[42px] bg-[#07382c] hover:bg-[#0b4d3d] text-white rounded-xl font-extrabold text-xs shadow-md active:scale-95 transition"
                      >
                        Save 30-Day Schedule
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* HELP & FEEDBACK MODAL (NO NUMBER DISPLAYED) */}
            {showFeedbackModal && (
              <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl border dark:border-slate-700`}>
                  <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">💬</span>
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-[#07382c] dark:text-emerald-300">शिकायत व सुझाव</h3>
                        <p className="text-[11px] text-slate-500">Help & Feedback</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowFeedbackModal(false)} aria-label="Close" className="text-xl p-1 text-slate-400 hover:text-slate-600 leading-none">✕</button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      अपनी बात, शिकायत या सुझाव यहाँ लिखें:
                    </label>
                    <textarea
                      rows={4}
                      value={feedbackMsg}
                      onChange={(e) => setFeedbackMsg(e.target.value)}
                      placeholder="यहाँ अपना संदेश लिखें... (जैसे: ऐप में कोई समस्या, सुझाव या नई मस्जिद जोड़ने में सहायता चाहिए)"
                      className="w-full p-3 rounded-2xl border bg-slate-50 dark:bg-slate-700/60 dark:border-slate-600 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {[
                        'मस्जिद जोड़ने में मदद चाहिए',
                        'ऐप में समस्या आ रही है',
                        'नया सुझाव देना है'
                      ].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setFeedbackMsg(prev => prev ? `${prev} - ${tag}` : tag)}
                          className="text-[10.5px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium active:scale-95 transition"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1 space-y-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const msgToSend = feedbackMsg.trim();
                        if (!msgToSend) { showToast('कृपया अपना संदेश लिखें', 'error'); return; }
                        if (firestoreDb) {
                          try {
                            await firestoreDb.collection('feedback_and_complaints').add({
                              userName: loggedImamMasjid ? (loggedImamMasjid.imamName || loggedImamMasjid.name) : 'User',
                              masjidName: currentMasjid ? currentMasjid.name : (loggedImamMasjid ? loggedImamMasjid.name : ''),
                              phone: loggedImamMasjid ? (loggedImamMasjid.phone || '') : '',
                              message: msgToSend,
                              type: msgToSend.includes('समस्या') || msgToSend.includes('शिकायत') ? 'complaint' : msgToSend.includes('सुझाव') ? 'suggestion' : 'feedback',
                              status: 'pending',
                              date: new Date().toLocaleDateString('en-GB'),
                              ts: Date.now()
                            });
                          } catch(e) {}
                        }
                        try {
                          if (mqttClient && mqttClient.connected) {
                            mqttClient.publish(`${TOPIC_DB_PREFIX}feedback`, JSON.stringify({ message: msgToSend, ts: Date.now() }), { qos: 1 });
                          }
                        } catch(e) {}
                        showToast('✅ आपकी शिकायत / सुझाव एडमिन पैनल को भेज दिया गया है!');
                        setFeedbackMsg('');
                        setShowFeedbackModal(false);
                      }}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white font-extrabold text-[13.5px] flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <span>📨 एडमिन पैनल में शिकायत / सुझाव दर्ज करें</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const msgToSend = feedbackMsg.trim() || 'السلام عليكم Admin Bhai, Mujhe Masjid Connect app ke baare me baat karni hai.';
                        openNativeWhatsApp(adminSupport.whatsapp || '918084329613', msgToSend);
                        setShowFeedbackModal(false);
                      }}
                      className="w-full min-h-[42px] rounded-xl bg-[#25D366] hover:bg-[#20ba59] active:bg-[#1caa51] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
                    >
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
                      <span>या सीधे WhatsApp पर भेजें</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFeedbackModal(false)}
                      className="w-full min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs active:scale-95 transition"
                    >
                      रद्द करें (Cancel)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SERVER SUPPORT MODAL (MATCHING MASJID DONATION STYLE) */}
            {showServerSupportModal && (() => {
              const A = adminSupport;
              const serverUpi = A.serverUpiId || A.upiId || '8084329613@upi';
              const adminQr = A.serverQrPhoto || A.qrPhoto || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink(serverUpi, 'Masjid Connect Server Support'))}`;
              return (
                <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
                  <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl border dark:border-slate-700 max-h-[92vh] overflow-y-auto`}>
                    <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">💝</span>
                        <div>
                          <h3 className="font-extrabold text-sm sm:text-base text-[#07382c] dark:text-emerald-300">सर्वर खर्च में सहयोग</h3>
                          <p className="text-[11px] text-slate-500">Server Expense Support</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setShowServerSupportModal(false)} aria-label="Close" className="text-xl p-1 text-slate-400 hover:text-slate-600 leading-none">✕</button>
                    </div>

                    {/* SHORT MESSAGE (DYNAMICALLY FROM ADMIN) */}
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-950 dark:text-amber-200 leading-relaxed break-words">
                      {A.supportMessage || 'यह ऐप अल्हम्दुलिल्लाह सभी मस्जिदों और मुक़्तदियों के लिए 100% मुफ़्त है। सर्वर, डेटाबेस व मैसेजिंग का मासिक खर्च चलाने में आप अपनी मर्जी से छोटा सहयोग दे सकते हैं।'}
                    </div>

                    {/* ADMIN QR CODE (LIKE MASJID DONATION) */}
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setQrFull(adminQr)}
                        aria-label="View QR Full Screen"
                        className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm active:scale-95 transition"
                      >
                        <img src={adminQr} alt="Admin UPI QR" className="w-44 h-44 object-contain" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrFull(adminQr)}
                        className="min-h-[38px] px-5 rounded-full bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold text-xs active:scale-95 transition shadow-xs"
                      >
                        🔍 View QR Full Screen
                      </button>
                    </div>

                    {/* UPI ID & QUICK DONATION */}
                    <div className="w-full flex flex-col items-center gap-2 pt-1">
                      <div className="font-mono text-xs font-bold break-all text-center select-all bg-slate-50 dark:bg-slate-700/60 p-2 rounded-xl border dark:border-slate-600 w-full text-emerald-800 dark:text-emerald-300">
                        {A.upiId || '8084329613@upi'}
                      </div>
                      <div className="flex gap-2 w-full pt-1">
                        <button
                          type="button"
                          onClick={() => copyText(A.upiId || '8084329613@upi')}
                          className="flex-1 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 font-bold text-xs flex items-center justify-center active:scale-95 transition"
                        >
                          📋 Copy UPI ID
                        </button>
                        <a
                          href={upiLink(A.upiId || '8084329613@upi', 'Masjid Connect Server Support')}
                          className="flex-1 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center active:scale-95 transition shadow-sm"
                        >
                          💳 Donate via UPI
                        </a>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowServerSupportModal(false)}
                      className="w-full min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs active:scale-95 transition mt-2"
                    >
                      बंद करें (Close)
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* QR FULL SCREEN */}
            {qrFull && (
              <div onClick={() => setQrFull(null)} className="fixed inset-0 z-[300] bg-black/85 flex flex-col items-center justify-center p-4 gap-3">
                <img src={qrFull} alt="UPI QR" className="max-w-full max-h-[78vh] rounded-2xl bg-white p-3" />
                <button className="min-h-[44px] px-6 rounded-full bg-white text-slate-900 font-bold text-sm">Close</button>
              </div>
            )}

            {/* EDIT INFO MODAL (imam) */}
            {showInfoEditModal && loggedImamMasjid && (
              <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border dark:border-slate-700 max-h-[92vh] overflow-y-auto`}>
                  <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-extrabold text-sm">ℹ️ About Masjid & Chanda Settings</h3><button onClick={() => setShowInfoEditModal(false)} aria-label="Close">✕</button></div>
                  <form onSubmit={handleSaveInfo} className="space-y-2.5 text-xs">
                    <p className="text-[11px] text-slate-500">Fields left blank will automatically remain hidden from Muqtadis.</p>
                    <div className="font-bold text-[#07382c] dark:text-emerald-300">🏫 Maktab</div>
                    <select value={infoDraft.maktabHas || ''} onChange={(e) => setD('maktabHas', e.target.value)} className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-bold"><option value="">— Select Maktab Status —</option><option value="yes">Maktab is Available</option><option value="no">No Maktab</option></select>
                    {infoDraft.maktabHas === 'yes' && (
                      <div className="space-y-2 pl-2 border-l-2 border-emerald-200">
                        {infoField('Maktab Timing', 'maktabTime', 'e.g. 4:00 PM to 6:00 PM', 'text', true)}
                        {infoField('Monthly Fee', 'maktabFee', 'e.g. ₹200 / Month or Free')}
                        {infoField('Classes', 'maktabClasses', 'e.g. Nazra, Hifz, Girls Batch')}
                        {infoField('Teacher Name', 'ustaadName', 'e.g. Hafiz Zaid')}
                        {infoField('Teacher Phone', 'ustaadPhone', 'e.g. 9876543210', 'tel')}
                      </div>
                    )}
                    <div className="font-bold text-[#07382c] dark:text-emerald-300 pt-1">🕌 Special Prayers</div>
                    {infoField('Juma Khutba Time', 'jumaKhutba', 'e.g. 1:15 PM', 'text', true)}
                    {infoField('Eid Prayer Time', 'eidTime', 'e.g. 8:00 AM', 'text', true)}
                    {infoField('Taraweeh Time', 'taraweeh', 'e.g. 20 Rakat, 9:00 PM', 'text', true)}
                    <div className="font-bold text-[#07382c] dark:text-emerald-300 pt-1">✅ Facilities</div>
                    <div className="flex flex-wrap gap-2">{FACILITIES.map(f => { const on = (infoDraft.facilities || []).includes(f); return <button type="button" key={f} onClick={() => toggleFacility(f)} aria-pressed={on} className={`px-3 py-1.5 rounded-full border text-[12px] font-semibold ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-700 border-slate-300'}`}>{on ? '✓ ' : ''}{f}</button>; })}</div>
                    <div className="font-bold text-[#07382c] dark:text-emerald-300 pt-1">👥 Committee / Mutawalli</div>
                    {infoField('Mutawalli / Committee Name', 'committeeName', 'e.g. Janab Salim Khan')}
                    {infoField('Mutawalli Mobile Number', 'committeePhone', 'e.g. 9876543210', 'tel')}
                    <div className="font-bold text-[#07382c] dark:text-emerald-300 pt-1">💝 Donation (UPI)</div>
                    {infoField('Masjid UPI ID (Optional)', 'upiId', 'e.g. masjid@upi')}
                    <div className="p-2 bg-emerald-50 dark:bg-slate-700/80 rounded-xl border border-emerald-100 dark:border-slate-600 space-y-2">
                      {infoDraft.upiQr && <img src={infoDraft.upiQr} alt="QR" className="w-32 h-32 object-contain bg-white rounded-xl border mx-auto" />}
                      <input type="file" id="qr-photo-input" accept="image/*" className="hidden" onChange={handleQrUpload} />
                      <div className="flex gap-2 justify-center"><label htmlFor="qr-photo-input" className="px-3 py-2 bg-[#07382c] text-white text-[11px] font-bold rounded-lg cursor-pointer">📸 {infoDraft.upiQr ? 'Change UPI QR Photo' : 'Upload UPI QR Photo'}</label>{infoDraft.upiQr && <button type="button" onClick={() => setD('upiQr', '')} className="px-3 py-2 bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold rounded-lg">Remove</button>}</div>
                      <p className="text-[10px] text-slate-500 text-center">Upload clear, straight QR code screenshot.</p>
                    </div>
                    <div className="flex gap-2 pt-2"><button type="button" onClick={() => setShowInfoEditModal(false)} className="w-1/2 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold">Cancel</button><button type="submit" className="w-1/2 py-2.5 bg-[#07382c] text-white rounded-xl font-bold shadow">Save</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* NOTIFICATION MODAL FIXED */}
            {showNotificationsModal && (
              <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
                 <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl`}>
                    <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                      <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-slate-900 dark:text-white">
                        <span>🔔</span>
                        <span>सूचनाएं व ऐलान</span>
                      </h3>
                      <button onClick={() => setShowNotificationsModal(false)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold">✕</button>
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-2">
                       {!notifModalItems.length ? (
                         <div className="text-center py-6 space-y-2">
                           <span className="text-3xl">📭</span>
                           <p className="text-xs font-bold text-slate-700 dark:text-slate-200">कोई नई सूचना नहीं है</p>
                           <p className="text-[10.5px] text-slate-400">देखे गए सभी पुराने ऐलान होम स्क्रीन पर "ताज़ा ऐलान" में मौजूद हैं।</p>
                           <button
                             type="button"
                             onClick={() => {
                               setShowNotificationsModal(false);
                               setCurrentTab('home');
                               setTimeout(() => {
                                 const el = document.getElementById('taza-aelan-section');
                                 if (el) el.scrollIntoView({ behavior: 'smooth' });
                               }, 120);
                             }}
                             className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-[#07382c] dark:text-emerald-300 text-xs font-black hover:bg-emerald-200 transition"
                           >
                             <span>📢</span>
                             <span>ताज़ा ऐलान देखें</span>
                           </button>
                         </div>
                       ) : notifModalItems.map(n => (
                           <div key={n.id} className={`p-3 border rounded-2xl ${n.isAdmin ? (darkMode ? 'bg-amber-950/40 border-amber-700/70' : 'bg-amber-50 border-amber-300') : (darkMode ? 'bg-slate-700/60 border-slate-600' : 'bg-emerald-50 border-emerald-200')}`}>
                               <div className="flex items-center justify-between gap-1.5 flex-wrap mb-1">
                                 <span className={`text-[9.5px] font-black px-1.5 py-0.5 rounded-md ${n.isAdmin ? 'bg-amber-500 text-slate-950 font-black' : 'bg-[#07382c] text-white font-bold'}`}>
                                   {n.isAdmin ? '👑 मस्जिद कनेक्ट एडमिन' : `🕌 ${n.senderName || currentMasjid?.name || 'मस्जिद'}`}
                                 </span>
                                 <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">🕒 {n.date}</span>
                               </div>
                               <h4 className="font-bold text-xs text-slate-900 dark:text-white">{n.title}</h4>
                               <p className="text-[11px] mt-1 text-slate-700 dark:text-slate-200 leading-relaxed font-urdu whitespace-pre-wrap">{n.message || n.body}</p>
                           </div>
                       ))}
                    </div>
                    <button onClick={() => setShowNotificationsModal(false)} className="w-full py-2.5 bg-[#07382c] text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition">
                      समझ गए (बंद करें)
                    </button>
                 </div>
              </div>
            )}

            {/* FORGOT CREDENTIALS MODAL */}
            {showForgotCredentialsModal && (
              <div className="fixed inset-0 z-[200] bg-black/75 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl max-h-[92vh] overflow-y-auto`}>
                  <div className="flex justify-between items-center border-b pb-2 dark:border-slate-700">
                    <h3 className="font-black text-sm text-[#07382c] dark:text-emerald-300 flex items-center gap-1.5">
                      <span>🔑</span>
                      <span>मस्जिद ID खोजें / पासवर्ड रीसेट</span>
                    </h3>
                    <button onClick={() => { setShowForgotCredentialsModal(false); setForgotPhoneInput(''); }} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold">✕</button>
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-3 text-xs">
                    <div>
                      <label className="font-extrabold block mb-1 text-slate-700 dark:text-slate-200">
                        📱 अपना 10 अंकों का मोबाइल नंबर या मस्जिद ID डालें:
                      </label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={forgotPhoneInput} 
                          onChange={(e) => setForgotPhoneInput(e.target.value)} 
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); } }}
                          placeholder="उदा: 9876543210 या MASJID-101" 
                          className="flex-1 min-w-0 p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-mono font-bold text-sm tracking-wide" 
                        />
                        {forgotPhoneInput && (
                          <button
                            type="button"
                            onClick={() => setForgotPhoneInput('')}
                            className="px-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 text-xs font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter and Display Matching Mosques */}
                    {(() => {
                      const rawInput = (forgotPhoneInput || '').trim();
                      const digitsOnly = rawInput.replace(/[^0-9]/g, '');
                      const last10Digits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
                      const queryLower = rawInput.toLowerCase();

                      if (!rawInput) {
                        return (
                          <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600 text-center space-y-1">
                            <span className="text-xl">🔍</span>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              ऊपर बॉक्स में अपना 10 अंकों का मोबाइल नंबर या मस्जिद ID दर्ज करें। आपकी मस्जिद की जानकारी नीचे तुरंत दिख जाएगी।
                            </p>
                          </div>
                        );
                      }

                      const matchedList = Object.values(masjids || {}).filter(m => {
                        if (!m) return false;
                        const mIdLower = String(m.id || '').trim().toLowerCase();
                        const mNameLower = String(m.name || '').trim().toLowerCase();
                        const mPhoneDigits = String(m.phone || '').replace(/[^0-9]/g, '');
                        const mLast10 = mPhoneDigits.length >= 10 ? mPhoneDigits.slice(-10) : mPhoneDigits;

                        // 1. Mobile number match
                        if (last10Digits.length >= 4) {
                          if (mLast10.includes(last10Digits) || last10Digits.includes(mLast10)) return true;
                        }
                        // 2. Mosque ID match
                        if (queryLower.length >= 2 && mIdLower.includes(queryLower)) return true;
                        // 3. Mosque Name match
                        if (queryLower.length >= 3 && mNameLower.includes(queryLower)) return true;
                        return false;
                      });

                      if (matchedList.length === 0) {
                        return (
                          <div className="p-3 bg-rose-50 dark:bg-rose-900/30 rounded-2xl border border-rose-200 dark:border-rose-800 text-center space-y-1.5">
                            <span className="text-xl">❌</span>
                            <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                              "{rawInput}" पर कोई मस्जिद नहीं मिली!
                            </p>
                            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                              कृपया वही मोबाइल नंबर या मस्जिद ID दर्ज करें जो रजिस्ट्रेशन के समय उपयोग की गई थी।
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                            ✓ {matchedList.length} मस्जिद पाई गई:
                          </p>
                          {matchedList.map(m => (
                            <div key={m.id} className="p-3 border rounded-2xl bg-slate-50 dark:bg-slate-700/70 dark:border-slate-600 flex flex-col gap-2 shadow-xs">
                              <div className="flex justify-between items-center gap-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <strong className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{m.name}</strong>
                                  {isBlueTickActive(m) && <VerifiedBadge size="xs" />}
                                </div>
                                <span className="text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-md shrink-0">ID: {m.id}</span>
                              </div>
                              <span className="text-[10.5px] text-slate-500 dark:text-slate-400">📍 {m.address}{m.stateLocation ? `, ${m.stateLocation}` : ''}</span>
                              
                              {/* Single 1-Click Action + Rate Limit & Ban Check */}
                              {(() => {
                                const isBanned = Boolean(m.isBanned || m.isSuspended || (typeof checkIsRegionBanned === 'function' && checkIsRegionBanned(m)));
                                const userResetHistoryKey = `mc_reset_log_${m.id}`;
                                let recentAttempts = [];
                                try {
                                  const rawLog = safeStorageGet(userResetHistoryKey, '[]');
                                  const parsedLog = JSON.parse(rawLog);
                                  if (Array.isArray(parsedLog)) {
                                    recentAttempts = parsedLog.filter(ts => typeof ts === 'number' && ts > (Date.now() - 24 * 60 * 60 * 1000));
                                  }
                                } catch (e) { recentAttempts = []; }
                                const isLimitExceeded = recentAttempts.length >= 3;

                                if (isBanned) {
                                  return (
                                    <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-center space-y-1">
                                      <span className="text-base">⚠️</span>
                                      <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                                        सुरक्षा कारणों से यह मस्जिद आईडी अस्थायी रूप से लॉक है। एडमिन से संपर्क करें।
                                      </p>
                                    </div>
                                  );
                                }

                                if (isLimitExceeded) {
                                  return (
                                    <div className="p-2.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl text-center space-y-1">
                                      <span className="text-base">⛔</span>
                                      <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                        आज के लिए आपकी 3 रिक्वेस्ट पूरी हो चुकी हैं। कृपया 24 घंटे बाद दोबारा कोशिश करें।
                                      </p>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="space-y-2 pt-0.5">
                                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-700/60 rounded-xl text-[10.5px] text-emerald-950 dark:text-emerald-200 leading-snug">
                                      ✨ <b>1-क्लिक सुविधा:</b> नीचे बटन दबाते ही मस्जिद ID (<b>{m.id}</b>) लॉगिन फॉर्म में भर जाएगी, और 2 से 3 मिनट में आपके रजिस्टर्ड मोबाइल नंबर पर पासवर्ड भेज दिया जाएगा।
                                      {recentAttempts.length > 0 && (
                                        <span className="block mt-1 text-[9.5px] text-amber-700 dark:text-amber-400 font-bold">
                                          (आज के प्रयास: {recentAttempts.length}/3)
                                        </span>
                                      )}
                                    </div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleSendResetRequest(m)} 
                                      className="w-full py-2.5 bg-[#07382c] hover:bg-[#0c4033] active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition"
                                    >
                                      <span className="text-base">📩</span>
                                      <span>Request Password (2-3 मिनट में प्राप्त करें)</span>
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </form>
                </div>
              </div>
            )}

            {/* RESET SUCCESS POP-UP NOTICE (2-3 MINUTE CONFIRMATION) */}
            {resetSuccessNotice && (
              <div className="fixed inset-0 z-[250] bg-black/75 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'} rounded-[2rem] p-5 max-w-sm w-full space-y-3.5 shadow-2xl border text-center dark:border-slate-700`}>
                  <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-3xl">
                    ✅
                  </div>
                  <h3 className="font-black text-base text-emerald-900 dark:text-emerald-300">अनुरोध दर्ज हो गया!</h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    मस्जिद <b>{resetSuccessNotice.masjidName}</b> (ID: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{resetSuccessNotice.masjidId}</span>) की ID आपके लॉगिन फॉर्म में भर दी गई है।
                  </p>
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-2xl border border-amber-200 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200 font-bold">
                    ⏳ अगले <b>2 से 3 मिनट</b> के अंदर आपके रजिस्टर्ड मोबाइल नंबर (<b>{resetSuccessNotice.phone}</b>) पर WhatsApp द्वारा पासवर्ड भेज दिया जाएगा।
                  </div>
                  <button
                    type="button"
                    onClick={() => setResetSuccessNotice(null)}
                    className="w-full py-2.5 bg-[#07382c] hover:bg-[#0c4033] text-white rounded-xl text-xs font-black shadow-md transition"
                  >
                    ठीक है (OK)
                  </button>
                </div>
              </div>
            )}

            {/* EDIT PROFILE MODAL */}
            {showEditProfileModal && loggedImamMasjid && (
              <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border dark:border-slate-700 max-h-[92vh] overflow-y-auto`}>
                  <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-extrabold text-sm">✏️ Edit Mosque Profile</h3><button onClick={() => setShowEditProfileModal(false)}>✕</button></div>
                  <form onSubmit={handleSaveProfileEdit} className="space-y-2.5 text-xs">
                    <div className="flex items-center gap-3 p-2 bg-emerald-50 dark:bg-slate-700/80 rounded-xl border border-emerald-100 dark:border-slate-600">
                        <img src={editPhotoUrl || loggedImamMasjid.photo || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500" />
                        <div>
                            <input type="file" id="edit-photo-input" accept="image/*" className="hidden" onChange={handleEditGalleryPhotoUpload} />
                            <label htmlFor="edit-photo-input" className="px-3 py-1.5 bg-[#07382c] text-white text-[10px] font-bold rounded-lg cursor-pointer shadow-sm">📸 Change Mosque Photo</label>
                            {editPhotoUrl && <span className="block mt-1 text-[9px] text-emerald-600 font-bold">✓ Photo Selected</span>}
                        </div>
                    </div>
                    <div><input name="mName" defaultValue={loggedImamMasjid?.name || ''} placeholder="Mosque Name (e.g. Jama Masjid) *" required className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-bold" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><input name="mAddress" defaultValue={loggedImamMasjid?.address || ''} placeholder="Address / Mohalla (e.g. Mohalla Azad Nagar) *" required className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /></div>
                      <div><input name="mCity" defaultValue={loggedImamMasjid?.stateLocation || ''} placeholder="City (e.g. Azamgarh) *" required className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /></div>
                    </div>
                    <div><input name="mState" defaultValue={loggedImamMasjid?.stateName || ''} placeholder="State (e.g. Uttar Pradesh)" className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><input name="mPhone" type="tel" defaultValue={loggedImamMasjid?.phone || ''} placeholder="Phone Number (e.g. 9876543210) *" required className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /></div>
                      <div><input name="mImam" defaultValue={loggedImamMasjid?.imamName || ''} placeholder="Imam Name (e.g. Maulana Ahmad) *" required className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /></div>
                    </div>
                    <div className="pt-2 border-t dark:border-slate-700 space-y-2">
                      <div className="font-bold text-slate-500 text-xs">🔐 Login Credentials (Optional Change)</div>
                      <div><input name="mNewId" defaultValue={loggedImamMasjid?.id || ''} placeholder="Mosque ID (e.g. MASJID-101)" className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-mono uppercase" /></div>
                      <div>
                        <div className="flex gap-1.5"><input name="mNewPass" type={showEditPass ? 'text' : 'password'} defaultValue={loggedImamMasjid?.passcode || ''} placeholder="New Password (e.g. 786)" className="flex-1 min-w-0 p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /><button type="button" onClick={() => setShowEditPass(!showEditPass)} aria-label="Show/Hide Password" className="px-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-sm">{showEditPass ? '🙈' : '👁️'}</button></div>
                      </div>
                      <div><input name="mCurPass" type="password" autoComplete="off" placeholder="Current Password (required to change ID or Password)" className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" /></div>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">If ID is changed, login again with new ID. Old ID will be deactivated.</p>
                    </div>

                    {/* LOCATION AT THE VERY BOTTOM OF EDIT PROFILE WITH SATELLITE GOOGLE MAP */}
                    <div className="pt-2 border-t dark:border-slate-700 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-emerald-950 dark:text-emerald-300 text-xs">📍 Mosque Location on Satellite Map</span>
                        <button type="button" onClick={handleFetchEditGpsLocation} className="px-2.5 py-1 bg-[#07382c] text-white rounded-lg text-[10px] font-bold">🔄 Refresh GPS</button>
                      </div>
                      <LocationPicker lat={parseFloat(editLat) || 28.6139} lng={parseFloat(editLng) || 77.2090} onChange={(a, b) => { setEditLat(a); setEditLng(b); }} height={380} />
                      <p className="text-[10px] text-slate-500">Tap on map or drag 📍 to place on mosque roof.</p>
                      <div className="flex items-center justify-between gap-2 p-1.5 bg-emerald-50 dark:bg-slate-700/60 rounded-xl border border-emerald-100 dark:border-slate-600">
                        <span className="text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300">{Number(editLat).toFixed(5)}, {Number(editLng).toFixed(5)}</span>
                        <span className="text-[9.5px] text-slate-500 font-semibold">उपग्रह (Satellite) व्यू</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2"><button type="button" onClick={() => setShowEditProfileModal(false)} className="w-1/2 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold">Cancel</button><button type="submit" className="w-1/2 py-2.5 bg-[#07382c] text-white rounded-xl font-bold shadow">Save Profile</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* REGISTER MODAL */}
            {showRegisterModal && (
              <div className="fixed inset-0 z-[200] bg-black/75 flex items-center justify-center p-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-[2rem] p-5 max-w-sm w-full space-y-3.5 max-h-[92vh] overflow-y-auto shadow-2xl`}>
                  <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-black text-sm text-emerald-900 dark:text-emerald-300">Register New Mosque</h3><button onClick={() => setShowRegisterModal(false)}>✕</button></div>
                  <form onSubmit={(e) => {
                    e.preventDefault(); const form = e.target;
                    const id = form.mId.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                    if (!id) { showToast('❌ सही मस्जिद ID दर्ज करें (जैसे MASJID-101)', 'error'); return; }
                    const isAlreadyTaken = Object.keys(masjids).some(k => k.trim().toUpperCase() === id) ||
                                           Object.values(masjids).some(m => m.id && m.id.trim().toUpperCase() === id);
                    if (isAlreadyTaken) {
                      showToast('❌ यह ID पहले से किसी मस्जिद की है! कृपया कोई दूसरी अनोखी ID चुनें', 'error');
                      return;
                    }
                    const finalLat = parseFloat(regLat) || userLocation.lat || 28.6139;
                    const finalLng = parseFloat(regLng) || userLocation.lng || 77.2090;
                    const finalCity = (regDistrict === 'other' ? regCustomDistrict.trim() : regDistrict) || 'Mau';
                    const finalState = regState || 'Uttar Pradesh';
                    const newM = {
                      id, name: form.mName.value.trim(), address: form.mAddress.value.trim(), stateLocation: finalCity, stateName: finalState, phone: form.mPhone.value.trim(), imamName: form.mImam.value.trim(), 
                      photo: regPhotoUrl || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80', passcode: form.mPasscode.value.trim(),
                      lat: finalLat, lng: finalLng, dailyHadith: '“Ilm hasil karna har Musalman mard aur aurat par farz hai.”', dailyHadithRef: '— (Ibn Majah)', hijriDateStr: (getHijriToday() || '1 Muharram 1448'), lastDateSetISO: new Date().toISOString().slice(0, 10), registeredAtISO: new Date().toISOString(), schedule: defaultSchedule, updatedAt: Date.now()
                    };
                    publishMasjidUpdate(newM); setSelectedMasjidId(id); setFavorites([id]); setLoggedImamMasjidId(id);
                    setUserLocation({ lat: finalLat, lng: finalLng }); setHasGps(true); safeStorageSet('mc_user_location', JSON.stringify({ lat: finalLat, lng: finalLng })); safeStorageSet('mc_logged_imam_masjid_id', id); safeStorageSet('mc_selected_masjid_id', id); safeStorageSet('mc_user_favorites', JSON.stringify([id]));
                    setShowRegisterModal(false); setCurrentTab('profile'); showToast(`✅ मस्जिद रजिस्टर हो गई! ID: ${id}`);
                  }} className="space-y-3 text-xs">
                    <div className="flex items-center gap-3 p-2 bg-emerald-50 dark:bg-slate-700/80 rounded-xl border border-emerald-100 dark:border-slate-600">
                        <img src={regPhotoUrl || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500" />
                        <div><input type="file" id="reg-photo-input" accept="image/*" className="hidden" onChange={handleGalleryPhotoUpload} /><label htmlFor="reg-photo-input" className="px-3 py-1.5 bg-[#07382c] text-white text-[10px] font-bold rounded-lg cursor-pointer shadow-sm">📸 Choose Photo from Gallery</label></div>
                    </div>
                    <div><input type="text" name="mName" placeholder="Mosque Name (e.g. Jama Masjid) *" required className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600 font-bold" /></div>
                    <div>
                      <input name="mAddress" placeholder="Address / Mohalla (e.g. Mohalla Azad Nagar) *" required className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600 font-medium" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                          🏛️ राज्य (State) *
                        </label>
                        <select
                          value={regState}
                          onChange={(e) => {
                            const newSt = e.target.value;
                            setRegState(newSt);
                            const dists = (typeof INDIA_STATE_DISTRICTS !== 'undefined' && INDIA_STATE_DISTRICTS[newSt]) || [];
                            setRegDistrict(dists[0] || '');
                          }}
                          className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600 font-bold text-xs"
                          required
                        >
                          {(typeof ALL_INDIA_STATES !== 'undefined' ? ALL_INDIA_STATES : []).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                          🏙️ ज़िला (District) *
                        </label>
                        <select
                          value={regDistrict}
                          onChange={(e) => setRegDistrict(e.target.value)}
                          className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600 font-bold text-xs"
                          required
                        >
                          {((typeof INDIA_STATE_DISTRICTS !== 'undefined' && INDIA_STATE_DISTRICTS[regState]) || []).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                          <option value="other">अन्य (Other / Custom)</option>
                        </select>
                      </div>
                    </div>
                    {regDistrict === 'other' && (
                      <div>
                        <input
                          type="text"
                          value={regCustomDistrict}
                          onChange={(e) => setRegCustomDistrict(e.target.value)}
                          placeholder="अपने ज़िले / शहर का नाम लिखें (Type District Name) *"
                          required
                          className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600 text-xs font-bold"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div><input name="mPhone" type="tel" placeholder="Mobile Number (e.g. 9876543210) *" required className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600" /></div>
                      <div><input name="mImam" placeholder="Imam Name (e.g. Maulana Ahmad) *" required className="w-full p-2.5 border rounded-2xl dark:bg-slate-700 dark:border-slate-600" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><input name="mId" defaultValue={'MASJID-' + Math.floor(100 + Math.random() * 900)} placeholder="Mosque ID (e.g. MASJID-101) *" required className="w-full p-2.5 border rounded-xl font-mono font-bold uppercase dark:bg-slate-700 dark:border-slate-600" /></div>
                      <div><input name="mPasscode" defaultValue="786" placeholder="Password (e.g. 786) *" required className="w-full p-2.5 border rounded-xl font-mono font-bold dark:bg-slate-700 dark:border-slate-600" /></div>
                    </div>

                    {/* LOCATION AT THE BOTTOM OF REGISTRATION WITH SATELLITE GOOGLE MAP */}
                    <div className="pt-2 border-t dark:border-slate-700 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-emerald-950 dark:text-emerald-300 text-xs">📍 Mosque Location on Satellite Map</span>
                        <button type="button" onClick={() => handleFetchGpsLocation(false)} className="px-2.5 py-1 bg-[#07382c] text-white rounded-lg text-[10px] font-bold">🔄 Refresh GPS</button>
                      </div>
                      <LocationPicker lat={parseFloat(regLat) || 28.6139} lng={parseFloat(regLng) || 77.2090} onChange={(a, b) => { setRegLat(a); setRegLng(b); }} height={380} />
                      <p className="text-[10px] text-slate-500">Tap on map or drag 📍 to place on mosque roof.</p>
                      <div className="flex items-center justify-between gap-2 p-1.5 bg-emerald-50 dark:bg-slate-700/60 rounded-xl border border-emerald-100 dark:border-slate-600">
                        <span className="text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300">{Number(regLat || 28.6139).toFixed(5)}, {Number(regLng || 77.2090).toFixed(5)}</span>
                        <span className="text-[9.5px] text-slate-500 font-semibold">उपग्रह (Satellite) व्यू</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1"><button type="button" onClick={() => setShowRegisterModal(false)} className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold text-xs">Cancel</button><button type="submit" className="w-2/3 py-2.5 bg-[#07382c] text-white rounded-xl font-black text-xs shadow-md">✅ Register Mosque</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* CHANGE PASSWORD MODAL */}
            {showChangePasswordModal && (
               <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
                  <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 border shadow-2xl dark:border-slate-700`}>
                     <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-extrabold text-sm">🔑 Change Password</h3><button onClick={() => setShowChangePasswordModal(false)}>✕</button></div>
                     <form onSubmit={handleImamChangePassword} className="space-y-3 text-xs">
                        <div><input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full p-2.5 border rounded-xl font-mono dark:bg-slate-700 dark:border-slate-600" placeholder="New Password (e.g. 786) *" required/></div>
                        <div><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-2.5 border rounded-xl font-mono dark:bg-slate-700 dark:border-slate-600" placeholder="Confirm New Password *" required/></div>
                        <div className="flex gap-2 pt-2"><button type="button" onClick={() => setShowChangePasswordModal(false)} className="w-1/2 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold">Cancel</button><button type="submit" className="w-1/2 py-2.5 bg-[#07382c] text-white rounded-xl font-bold">Change</button></div>
                     </form>
                  </div>
               </div>
            )}

            {/* EDIT TIME MODAL */}
            {showEditTimeModal && (
              <div className="fixed inset-0 z-[200] bg-black/70 flex justify-center items-center p-3.5">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-4 max-w-sm w-full space-y-3 shadow-2xl border max-h-[95vh] overflow-y-auto dark:border-slate-700`}>
                  <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-extrabold text-sm">🕒 Namaz Times & Dates</h3><button onClick={() => setShowEditTimeModal(false)}>✕</button></div>
                  <form onSubmit={handleSaveScheduleInstant} className="space-y-3 text-[11px]">
                    <div className="grid grid-cols-2 gap-2">
                      <div><input value={editEnglishDate} onChange={(e) => setEditEnglishDate(e.target.value)} placeholder="English Date (e.g. Tue, Nov 03, 2026)" className="w-full p-2 border rounded-xl dark:bg-slate-700 dark:border-slate-600" required /></div>
                      <div><input value={editHijriDate} onChange={(e) => setEditHijriDate(e.target.value)} placeholder="Hijri Date (e.g. 23 Jumada al-Awwal 1448)" className="w-full p-2 border rounded-xl font-bold dark:bg-slate-700 dark:border-slate-600" required /></div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center p-2 rounded-xl border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/60">
                        <div>
                          <span className="font-extrabold text-xs text-indigo-950 dark:text-indigo-200 block">🌙 Khatm-e-Sehri</span>
                          <span className="text-[9.5px] text-indigo-700 dark:text-indigo-400">सहरी ख़त्म (फज्र अज़ान से पहले)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs">🕒</span>
                          <input type="time" value={editSchedule.khatmSehri || ''} onChange={(e) => setEditSchedule({ ...editSchedule, khatmSehri: e.target.value })} className="p-1 border rounded-lg w-24 dark:bg-slate-800 dark:border-slate-700 font-bold text-indigo-950 dark:text-indigo-200" required />
                        </div>
                      </div>
                      {[{ key: 'fajr', label: 'Fajr', jamatKey: 'fajrJamat' },{ key: 'zuhr', label: 'Zuhr', jamatKey: 'zuhrJamat' },{ key: 'asr', label: 'Asr', jamatKey: 'asrJamat' },{ key: 'maghrib', label: 'Maghrib', jamatKey: 'maghribJamat' },{ key: 'isha', label: 'Isha', jamatKey: 'ishaJamat' }].map((p) => (
                        <div key={p.key} className="flex justify-between items-center p-2 rounded-xl border bg-slate-50 dark:bg-slate-700 dark:border-slate-600">
                          <span className="font-extrabold w-14 text-xs">{p.label}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs">🕒</span>
                            <span className="text-[10px] text-slate-500">Azan:</span>
                            <input type="time" value={editSchedule[p.key] || ''} onChange={(e) => setEditSchedule({ ...editSchedule, [p.key]: e.target.value })} className="p-1 border rounded-lg w-20 dark:bg-slate-800 dark:border-slate-700 font-bold" required />
                          </div>
                          <div className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                            <span className="text-xs">🕒</span>
                            <span className="text-[10px]">Jamat:</span>
                            <input type="time" value={editSchedule[p.jamatKey] || ''} onChange={(e) => setEditSchedule({ ...editSchedule, [p.jamatKey]: e.target.value })} className="p-1 border rounded-lg w-20 dark:bg-slate-800 dark:border-slate-700 font-bold" required />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-2.5 border rounded-2xl bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 space-y-2">
                        <span className="font-bold block text-center text-xs text-amber-900 dark:text-amber-400 uppercase tracking-wider">TULU AFTAB, ZAWAL & JUMA</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 border p-1.5 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-base">🌄</span>
                            <div className="flex-1 min-w-0">
                              <span className="block text-[9px] font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider">TULU AFTAB</span>
                              <input type="time" value={editSchedule.sunrise || ''} onChange={(e) => setEditSchedule({ ...editSchedule, sunrise: e.target.value })} placeholder="Tulu Aftab" className="w-full p-0.5 border-0 font-mono font-bold dark:bg-slate-800" required />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 border p-1.5 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-base">🌇</span>
                            <div className="flex-1 min-w-0">
                              <span className="block text-[9px] font-black text-orange-900 dark:text-orange-300 uppercase tracking-wider">ZAWAL</span>
                              <input type="time" value={editSchedule.sunset || ''} onChange={(e) => setEditSchedule({ ...editSchedule, sunset: e.target.value })} placeholder="Zawal" className="w-full p-0.5 border-0 font-mono font-bold dark:bg-slate-800" required />
                            </div>
                          </div>
                        </div>
                        <div className="border-t pt-2 border-amber-200 dark:border-amber-900/30 flex gap-2">
                          <div className="w-1/2 flex items-center gap-1 border p-1.5 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-xs">🕒</span>
                            <span className="text-[10px] text-slate-500">Juma Azan:</span>
                            <input type="time" value={editSchedule.jumaAzan || ''} onChange={(e) => setEditSchedule({ ...editSchedule, jumaAzan: e.target.value })} className="w-full p-1 border-0 font-bold dark:bg-slate-800" required />
                          </div>
                          <div className="w-1/2 flex items-center gap-1 border p-1.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-emerald-700 dark:text-emerald-400">
                            <span className="text-xs">🕒</span>
                            <span className="text-[10px]">Jamat:</span>
                            <input type="time" value={editSchedule.jumaJamat || ''} onChange={(e) => setEditSchedule({ ...editSchedule, jumaJamat: e.target.value })} className="w-full p-1 border-0 font-bold dark:bg-slate-800" required />
                          </div>
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2"><button type="button" onClick={() => setShowEditTimeModal(false)} className="w-1/3 py-2.5 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-xs">Cancel</button><button type="submit" className="w-2/3 py-2.5 bg-[#07382c] text-white rounded-xl font-bold text-xs shadow">💾 Save Times</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* DELETE SAFETY MODAL */}
            {showDeleteSafetyModal && (
               <div className="fixed inset-0 z-[200] bg-black/75 flex justify-center items-center p-4">
                 <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 border-2 border-rose-300`}>
                   <h3 className="font-black text-rose-600 text-sm">Delete Mosque Profile?</h3>
                   <input type="password" value={deletePasswordInput} onChange={(e) => setDeletePasswordInput(e.target.value)} placeholder="Enter Mosque Password to Confirm Delete" className="w-full p-2.5 border-2 rounded-xl dark:bg-slate-700 dark:border-slate-600" />
                   <div className="flex gap-2">
                     <button onClick={()=>setShowDeleteSafetyModal(false)} className="w-1/2 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold text-xs">Cancel</button>
                     <button onClick={executeDeleteMasjidProfile} className="w-1/2 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-xs">🗑️ Delete</button>
                   </div>
                 </div>
               </div>
            )}
            
            {/* EDIT HADITH MODAL */}
            {showEditHadithModal && (
              <div className="fixed inset-0 z-[200] bg-black/60 flex justify-center items-center p-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3 border dark:border-slate-700`}>
                  <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-bold text-sm">📖 Update Daily Hadith</h3><button onClick={() => setShowEditHadithModal(false)}>✕</button></div>
                  <form onSubmit={handleSaveHadithInstant} className="space-y-3 text-xs">
                    <textarea rows={3} value={editHadithText} onChange={(e) => setEditHadithText(e.target.value)} placeholder="Enter Hadith text here... (e.g. Ilm hasil karna har Musalman par farz hai) *" className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-urdu" required />
                    <input type="text" value={editHadithRef} onChange={(e) => setEditHadithRef(e.target.value)} placeholder="Reference (e.g. Ibn Majah / Sahih Bukhari)" className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600" />
                    <div className="flex gap-2 pt-1"><button type="button" onClick={() => setShowEditHadithModal(false)} className="w-1/2 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold">Cancel</button><button type="submit" className="w-1/2 py-2.5 bg-[#07382c] text-white rounded-xl font-bold shadow">Save Hadith</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* SEND NOTICE MODAL */}
            {showNewNoticeModal && (
              <div className="fixed inset-0 z-[200] bg-black/60 flex justify-center items-center p-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-3xl p-5 max-w-sm w-full space-y-3 border dark:border-slate-700`}>
                  <div className="flex justify-between border-b pb-2 dark:border-slate-700"><h3 className="font-bold text-sm">📢 Post Announcement</h3><button onClick={() => setShowNewNoticeModal(false)}>✕</button></div>
                  <form onSubmit={handlePostNotice} className="space-y-2.5 text-xs">
                    <input type="text" placeholder="Announcement Title (e.g. Juma Special Notice) *" value={newNoticeTitle} onChange={(e) => setNewNoticeTitle(e.target.value)} className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-bold" required />
                    <textarea rows={3} placeholder="Write announcement message here... *" value={newNoticeMessage} onChange={(e) => setNewNoticeMessage(e.target.value)} className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:border-slate-600 font-urdu" required />
                    <div className="flex gap-2"><button type="button" onClick={() => setShowNewNoticeModal(false)} className="w-1/2 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold">Cancel</button><button type="submit" className="w-1/2 py-2.5 bg-[#07382c] text-white rounded-xl font-bold">Send Announcement</button></div>
                  </form>
                </div>
              </div>
            )}

            {/* PREMIUM PAYWALL / RENEWAL MODAL */}
            {showPremiumPaywallModal && (
              <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-xs flex justify-center items-center p-3.5 animate-in fade-in">
                <div className={`${darkMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200'} rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl border max-h-[95vh] overflow-y-auto`}>
                  
                  {/* Header */}
                  <div className="flex justify-between items-start border-b pb-2.5 dark:border-slate-700">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-500 text-base">👑</span>
                        <h3 className="font-masjid text-base sm:text-lg font-black text-[#07382c] dark:text-emerald-300">
                          Masjid Connect Premium
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 font-bold mt-0.5 truncate max-w-[220px]">
                        {paywallTargetMasjid ? paywallTargetMasjid.name : 'मस्जिद सदस्यता'}
                        {paywallTargetService === 'profileServices' && ' • 🛠️ प्रोफ़ाइल सेवाएं अनलॉक'}
                        {paywallTargetService === 'liveAzan' && ' • 📢 लाइव अज़ान अनलॉक'}
                        {paywallTargetService === 'blueTick' && ' • 🔵 ब्लू टिक अनलॉक'}
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowPremiumPaywallModal(false)}
                      className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center font-bold text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Service Specific Alert */}
                  {paywallTargetService && (
                    <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11.5px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                      <span className="text-base shrink-0">🔒</span>
                      <span>
                        {paywallTargetService === 'profileServices' && 'यह सर्विस लॉक है! पेमेंट करके Namaz Time, Hadith, Notice व प्रोफ़ाइल के सभी बटन चालू करें।'}
                        {paywallTargetService === 'liveAzan' && 'लाइव अज़ान सर्विस लॉक है! पेमेंट करके लाइव अज़ान ब्रॉडकास्टिंग तुरंत चालू करें।'}
                        {paywallTargetService === 'blueTick' && 'ब्लू टिक (Verified Badge) लॉक है! पेमेंट करके अपनी मस्जिद के नाम के आगे ब्लू टिक लगवाएं।'}
                      </span>
                    </div>
                  )}

                  {/* Pricing Badge */}
                  {(() => {
                    const activeFee = adminSupport.premiumFeeAmount || 499;
                    const promoNote = adminSupport.promotionalNote || '';
                    return (
                      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 p-2.5 rounded-2xl flex items-center justify-between shadow-xs">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider block opacity-90">वार्षिक प्लान</span>
                            {promoNote && (
                              <span className="bg-rose-600 text-white font-black text-[9px] px-1.5 py-0.2 rounded-full animate-pulse">
                                {promoNote}
                              </span>
                            )}
                          </div>
                          <strong className="text-xl font-mono font-black">₹{activeFee} <span className="text-xs font-bold font-sans">/ 1 वर्ष</span></strong>
                        </div>
                        <div className="text-right text-[10px] font-black space-y-0.5">
                          <span className={`px-2 py-0.5 rounded-full block ${paywallTargetService === 'liveAzan' ? 'bg-amber-300 text-slate-950 ring-2 ring-white font-extrabold' : 'bg-slate-950 text-amber-300'}`}>✓ लाइव अज़ान</span>
                          <span className={`px-2 py-0.5 rounded-full block ${paywallTargetService === 'profileServices' ? 'bg-amber-300 text-slate-950 ring-2 ring-white font-extrabold' : 'bg-slate-950 text-amber-300'}`}>✓ टाइम व प्रोफ़ाइल एडिट</span>
                          <span className={`px-2 py-0.5 rounded-full block ${paywallTargetService === 'blueTick' ? 'bg-amber-300 text-slate-950 ring-2 ring-white font-extrabold' : 'bg-slate-950 text-amber-300'}`}>✓ ब्लू टिक (Verified)</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* QR Code and UPI ID */}
                  {(() => {
                    const premUpi = adminSupport.premiumUpiId || adminSupport.upiId || '8084329613@upi';
                    const activeFee = adminSupport.premiumFeeAmount || 499;
                    const premQr = adminSupport.premiumQrPhoto || adminSupport.qrPhoto || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink(premUpi, `Masjid Connect Premium ${activeFee}`, activeFee))}`;
                    return (
                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-750 border dark:border-slate-700 text-center space-y-2">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                          Google Pay / PhonePe / Paytm से QR स्कैन करें:
                        </span>
                        <div className="bg-white p-2 rounded-2xl border-2 border-amber-400 inline-block shadow-sm">
                          <img 
                            src={premQr} 
                            alt="Premium Subscription QR" 
                            className="w-32 h-32 mx-auto object-contain" 
                          />
                        </div>
                        <div className="flex items-center justify-center gap-1.5 pt-0.5">
                          <span className="font-mono text-xs font-bold text-[#07382c] dark:text-emerald-300 bg-white dark:bg-slate-700 px-2.5 py-1 rounded-xl border select-all">
                            {premUpi}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(premUpi);
                              showToast('📋 UPI ID कॉपी हो गई!');
                            }}
                            className="px-2 py-1 bg-slate-200 dark:bg-slate-600 hover:bg-emerald-600 hover:text-white rounded-xl text-[10px] font-bold transition"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* UTR / Transaction Submission Form */}
                  <form onSubmit={handleSubmitPaymentVerification} className="space-y-3 text-xs">
                    <div className="font-bold text-[#07382c] dark:text-emerald-300 text-xs border-t pt-2 dark:border-slate-700">
                      पेमेंट करने के बाद विवरण यहाँ भरें:
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold mb-1">
                        Transaction ID / UTR नंबर *
                      </label>
                      <input 
                        type="text" 
                        value={paymentUtrInput} 
                        onChange={(e) => setPaymentUtrInput(e.target.value)} 
                        placeholder="e.g. 12 अंकों का UTR नंबर लिखें (जैसे 408432961312)" 
                        required 
                        className="w-full p-2.5 rounded-xl border font-mono font-bold dark:bg-slate-700 dark:border-slate-600 text-xs" 
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold mb-1">
                        पेमेंट तारीख व समय (Date & Time)
                      </label>
                      <input 
                        type="text" 
                        value={paymentDateTimeInput} 
                        onChange={(e) => setPaymentDateTimeInput(e.target.value)} 
                        className="w-full p-2 rounded-xl border text-[11px] font-mono dark:bg-slate-700 dark:border-slate-600" 
                      />
                    </div>

                    <div className="pt-1">
                      <button 
                        type="submit" 
                        className="w-full py-3 bg-gradient-to-r from-[#0c4033] to-[#07382c] hover:from-[#092e24] hover:to-[#05281e] text-white rounded-2xl text-xs font-black shadow-lg active:scale-95 transition flex items-center justify-center gap-1.5"
                      >
                        <span>✅</span>
                        <span>Submit for Verification</span>
                      </button>
                      <p className="text-[10px] text-slate-400 text-center mt-1.5">
                        सबमिट करते ही एडमिन सत्यापन कर 1-क्लिक में आपकी मस्जिद को अप्रूव कर देंगे।
                      </p>
                    </div>
                  </form>

                </div>
              </div>
            )}
            
          </div>
        );
      }
      ReactDOM.createRoot(document.getElementById('root')).render(<MasjidConnectApp />);
    
