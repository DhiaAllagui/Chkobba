/**
 * Tunisian Café Radio — radio.js
 * Self-contained music player engine for Chkobba.
 * Exposes window.radioPlayer = { play, pause, next, setVolume, duck }
 *
 * ⚠️  Drop your .mp3 files into /music/ and list them in PLAYLIST below.
 */

(function () {
  // ── Playlist ── Add/edit filenames to match your /music/ folder ─────────────
  const PLAYLIST = [
    'Yrouli.mp3',
    'Taht el Yasmina fellil.mp3',
    'dernier but.mp3',
    '7oumani.mp3',
    'nadi canadi.mp3'
  ];

  const MUSIC_BASE = '../sound/';

  // ── State ────────────────────────────────────────────────────────────────────
  let shuffled = [];
  let currentIndex = 0;
  let audio = new Audio();
  let isPlaying = false;
  let userVolume = parseFloat(localStorage.getItem('chkobba_radio_vol') ?? '0.6');
  let duckTimer = null;
  let fadeRaf = null;

  // ── Fisher-Yates Shuffle ─────────────────────────────────────────────────────
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function initPlaylist() {
    shuffled = shuffle(PLAYLIST);
    currentIndex = 0;
  }

  // ── Title Formatter ──────────────────────────────────────────────────────────
  function formatTitle(filename) {
    return filename
      .replace(/\.[^.]+$/, '')          // remove extension
      .replace(/[-_]/g, ' ')            // dashes/underscores → spaces
      .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
  }

  // ── Load & bind ──────────────────────────────────────────────────────────────
  function loadTrack(index) {
    audio.src = MUSIC_BASE + shuffled[index];
    audio.volume = userVolume;
    updateNowPlaying();
  }

  function updateNowPlaying() {
    const el = document.getElementById('radio-now-playing');
    if (el) el.textContent = formatTitle(shuffled[currentIndex]);
  }

  // ── Playback controls ────────────────────────────────────────────────────────
  function play() {
    audio.play().catch(() => { }); // swallow autoplay policy errors
    isPlaying = true;
    syncUI();
    localStorage.setItem('chkobba_radio_on', '1');
  }

  function pause() {
    audio.pause();
    isPlaying = false;
    syncUI();
    localStorage.setItem('chkobba_radio_on', '0');
  }

  function toggle() {
    isPlaying ? pause() : play();
  }

  function next() {
    currentIndex = (currentIndex + 1) % shuffled.length;
    // Re-shuffle when we wrap around for variety
    if (currentIndex === 0) initPlaylist();
    loadTrack(currentIndex);
    if (isPlaying) play();
  }

  function prev() {
    currentIndex = (currentIndex - 1 + shuffled.length) % shuffled.length;
    loadTrack(currentIndex);
    if (isPlaying) play();
  }

  // Auto-advance when a song ends
  audio.addEventListener('ended', next);

  // ── Volume ───────────────────────────────────────────────────────────────────
  let isMuted = false;

  function setVolume(v) {
    userVolume = Math.max(0, Math.min(1, v));
    if (!isMuted) audio.volume = userVolume;
    localStorage.setItem('chkobba_radio_vol', String(userVolume));
    const slider = document.getElementById('radio-vol-slider');
    if (slider) slider.value = Math.round(userVolume * 100);
  }

  function toggleMute() {
    isMuted = !isMuted;
    audio.volume = isMuted ? 0 : userVolume;
    const btn = document.getElementById('radio-mute-btn');
    if (btn) {
      const muteImg = btn.querySelector('img');
      if (muteImg) muteImg.src = isMuted ? '../img/volumedown.png' : '../img/volumeup.png';
      btn.title = isMuted ? 'Unmute' : 'Mute';
    }
  }

  // ── Audio Ducking ─────────────────────────────────────────────────────────────
  // Call this when a game SFX fires. Music dips to 30% then fades back.
  function duck() {
    if (!isPlaying) return;
    // Cancel any running fade
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    if (duckTimer) clearTimeout(duckTimer);

    audio.volume = userVolume * 0.3;

    duckTimer = setTimeout(() => {
      // Smooth fade back over 600 ms
      const target = userVolume;
      const start = audio.volume;
      const duration = 600;
      const startTime = performance.now();

      function fade(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        audio.volume = start + (target - start) * progress;
        if (progress < 1) {
          fadeRaf = requestAnimationFrame(fade);
        } else {
          audio.volume = target;
          fadeRaf = null;
        }
      }
      fadeRaf = requestAnimationFrame(fade);
    }, 1000);
  }

  // ── UI Sync ──────────────────────────────────────────────────────────────────
  function syncUI() {
    const playIcon = document.getElementById('radio-play-icon');
    if (playIcon) playIcon.src = isPlaying ? '/img/pause.png' : '/img/resume.png';
    const widget = document.getElementById('radio-widget');
    if (widget) widget.classList.toggle('radio-active', isPlaying);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    initPlaylist();
    loadTrack(currentIndex);
    audio.volume = userVolume;

    // Restore UI
    const slider = document.getElementById('radio-vol-slider');
    if (slider) {
      slider.value = Math.round(userVolume * 100);
      slider.addEventListener('input', () => setVolume(slider.value / 100));
    }

    const playBtn = document.getElementById('radio-play-btn');
    if (playBtn) playBtn.addEventListener('click', toggle);

    const nextBtn = document.getElementById('radio-next-btn');
    if (nextBtn) nextBtn.addEventListener('click', next);

    const prevBtn = document.getElementById('radio-prev-btn');
    if (prevBtn) prevBtn.addEventListener('click', prev);

    const muteBtn = document.getElementById('radio-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', toggleMute);

    const fabBtn = document.getElementById('radio-fab-btn');
    if (fabBtn) {
      fabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const widget = document.getElementById('radio-widget');
        widget.classList.toggle('radio-open');
      });
    }

    // Close radio panel when clicking outside
    document.addEventListener('click', (e) => {
      const widget = document.getElementById('radio-widget');
      if (widget && widget.classList.contains('radio-open') && !widget.contains(e.target)) {
        widget.classList.remove('radio-open');
      }
    });

    // Always start paused by default as per user request
    localStorage.setItem('chkobba_radio_on', '0');
    isPlaying = false;
    audio.pause();
    
    syncUI();
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  window.radioPlayer = { play, pause, toggle, next, prev, setVolume, toggleMute, duck };
})();
