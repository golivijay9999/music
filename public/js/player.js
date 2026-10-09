/**
 * player.js - Core Audio Engine for Aura Music
 * Handles playback, Web Audio Equalizer, MediaSession, Queue & State.
 */

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = -1;
    this.isPlaying = false;
    this.isShuffled = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.quality = localStorage.getItem('aura_quality') || '320';
    this.volume = parseFloat(localStorage.getItem('aura_volume') || '0.8');
    this.isMuted = false;
    this.originalQueue = [];

    // Web Audio Equalizer setup
    this.audioCtx = null;
    this.sourceNode = null;
    this.eqFilters = [];
    this.analyser = null;

    this.initEvents();
    this.setVolume(this.volume);
  }

  initWebAudio() {
    if (this.audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      // 5-band Equalizer: 60Hz (Sub-bass), 250Hz (Bass), 1kHz (Mid), 4kHz (Treble), 14kHz (Air)
      const frequencies = [60, 250, 1000, 4000, 14000];
      this.eqFilters = frequencies.map((freq, index) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === frequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.0;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0;
        return filter;
      });

      // Chain: source -> filter0 -> filter1 -> ... -> filter4 -> destination
      let lastNode = this.sourceNode;
      this.eqFilters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });
      lastNode.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API not supported or blocked:', err);
    }
  }

  setEqBand(bandIndex, gainValue) {
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.value = gainValue;
    }
  }

  applyPreset(presetName) {
    this.initWebAudio();
    const presets = {
      flat: [0, 0, 0, 0, 0],
      bass: [6, 4, 1, 0, -1],
      vocal: [-2, 1, 4, 3, 1],
      treble: [-2, 0, 2, 5, 7],
      pop: [2, 3, 0, 2, 4],
      rock: [5, 3, -1, 3, 5],
      electronic: [6, 4, 0, 3, 5]
    };

    const gains = presets[presetName] || presets.flat;
    gains.forEach((g, idx) => this.setEqBand(idx, g));
    return gains;
  }

  initEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (window.App) window.App.updatePlayState(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (window.App) window.App.updatePlayState(false);
    });

    this.audio.addEventListener('timeupdate', () => {
      if (window.App) window.App.updateProgress(this.audio.currentTime, this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      if (window.App) window.App.showToast('Could not play track. Trying next...', 'error');
      setTimeout(() => this.playNext(), 1500);
    });
  }

  handleTrackEnded() {
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.play();
    } else {
      this.playNext();
    }
  }

  setQueue(tracks, startIndex = 0) {
    this.originalQueue = [...tracks];
    this.queue = this.isShuffled ? this.shuffleArray([...tracks]) : [...tracks];
    this.queueIndex = startIndex;
    if (this.queue[this.queueIndex]) {
      this.loadTrack(this.queue[this.queueIndex]);
    }
  }

  shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    const current = this.currentTrack;
    if (this.isShuffled) {
      this.queue = this.shuffleArray([...this.originalQueue]);
      if (current) {
        this.queueIndex = this.queue.findIndex(t => t.id === current.id);
      }
    } else {
      this.queue = [...this.originalQueue];
      if (current) {
        this.queueIndex = this.queue.findIndex(t => t.id === current.id);
      }
    }
    return this.isShuffled;
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'off';
    }
    return this.repeatMode;
  }

  async loadTrack(track) {
    if (!track) return;
    this.currentTrack = track;

    // Initialize Web Audio upon first interaction
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    let streamUrl = track.audioUrl;
    // If not direct URL, resolve via API
    if (!streamUrl && track.id) {
      try {
        const resp = await fetch(`/api/song/${encodeURIComponent(track.id)}?quality=${this.quality}`);
        const data = await resp.json();
        if (data.success && data.song) {
          track.audioUrl = data.song.audioUrl;
          streamUrl = data.song.audioUrl;
        }
      } catch (e) {
        console.error('Error resolving track audio:', e);
      }
    }

    if (!streamUrl) {
      if (window.App) window.App.showToast('Audio stream unavailable for this track', 'error');
      return;
    }

    this.audio.src = streamUrl;
    this.play();

    // Update MediaSession
    this.updateMediaSession(track);

    // Save to recently played
    if (window.Library) window.Library.addToHistory(track);

    // Notify UI
    if (window.App) window.App.onTrackChange(track);
  }

  play() {
    this.audio.play().catch(err => {
      console.warn('Playback prevented by browser autoplay policy:', err);
    });
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.audio.paused) {
      if (!this.currentTrack && this.queue.length > 0) {
        this.loadTrack(this.queue[0]);
      } else {
        this.play();
      }
    } else {
      this.pause();
    }
  }

  playNext() {
    if (this.queue.length === 0) return;
    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      this.loadTrack(this.queue[this.queueIndex]);
    } else if (this.repeatMode === 'all') {
      this.queueIndex = 0;
      this.loadTrack(this.queue[0]);
    } else {
      this.pause();
    }
  }

  playPrevious() {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.loadTrack(this.queue[this.queueIndex]);
    } else {
      this.audio.currentTime = 0;
    }
  }

  seek(seconds) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  seekRelative(delta) {
    this.seek(this.audio.currentTime + delta);
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audio.volume = this.isMuted ? 0 : this.volume;
    localStorage.setItem('aura_volume', this.volume);
    if (window.App) window.App.updateVolumeUI(this.volume, this.isMuted);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;
    if (window.App) window.App.updateVolumeUI(this.volume, this.isMuted);
    return this.isMuted;
  }

  addToQueue(track) {
    this.queue.push(track);
    this.originalQueue.push(track);
    if (window.App) {
      window.App.showToast(`Added "${track.title}" to Queue`);
      window.App.renderQueue();
    }
  }

  setQuality(q) {
    this.quality = q;
    localStorage.setItem('aura_quality', q);
    if (this.currentTrack && this.currentTrack.id) {
      const currentPos = this.audio.currentTime;
      const wasPlaying = !this.audio.paused;
      this.loadTrack(this.currentTrack).then(() => {
        this.audio.currentTime = currentPos;
        if (!wasPlaying) this.pause();
      });
    }
  }

  updateMediaSession(track) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Aura Music',
        artwork: [
          { src: track.image, sizes: '96x96', type: 'image/jpeg' },
          { src: track.image, sizes: '192x192', type: 'image/jpeg' },
          { src: track.image, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) this.seek(details.seekTime);
      });
    }
  }
}

window.AudioPlayer = AudioPlayer;
