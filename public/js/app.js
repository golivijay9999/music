/**
 * app.js - Main Application Controller for Aura Music
 */

class AppController {
  constructor() {
    this.currentView = 'home';
    this.historyStack = ['home'];
    this.historyIndex = 0;
    this.searchDebounceTimer = null;

    // Components
    this.player = new AudioPlayer();
    this.library = new MusicLibrary();
    this.lyrics = new LyricsManager();
    this.localFiles = new LocalFileManager();

    // Expose globally
    window.player = this.player;
    window.Library = this.library;
    window.App = this;

    this.initDOM();
    this.bindEvents();
    this.initKeyboardShortcuts();
    this.loadHomeData();
    this.updateLibrarySidebar();
  }

  initDOM() {
    this.mainView = document.getElementById('viewScroll');
    this.searchInput = document.getElementById('headerSearchInput');
    this.searchClearBtn = document.getElementById('searchClearBtn');
    this.ambientGlow = document.getElementById('ambientGlow');

    // Player Elements
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.repeatBtn = document.getElementById('repeatBtn');
    this.progressBarContainer = document.getElementById('progressBarContainer');
    this.progressBarFill = document.getElementById('progressBarFill');
    this.currentTimeEl = document.getElementById('currentTime');
    this.totalDurationEl = document.getElementById('totalDuration');
    this.volumeContainer = document.getElementById('volumeContainer');
    this.volumeFill = document.getElementById('volumeFill');
    this.volumeBtn = document.getElementById('volumeBtn');
    this.playerHeartBtn = document.getElementById('playerHeartBtn');
    this.qualityPill = document.getElementById('qualityPill');
    this.qualityText = document.getElementById('qualityText');

    // Modals & Panels
    this.queueDrawer = document.getElementById('queueDrawer');
    this.eqModal = document.getElementById('eqModal');
    this.createPlaylistModal = document.getElementById('createPlaylistModal');
    this.fullscreenOverlay = document.getElementById('fullscreenMode');

    // Set initial quality text
    if (this.qualityText) {
      this.qualityText.textContent = (this.player.quality || '320') + ' kbps';
    }

    // Init local files drop zone
    this.localFiles.initDropZone();
  }

  bindEvents() {
    // Navigation items
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.dataset.nav;
        this.navigateTo(target);
      });
    });

    // Back / Forward buttons
    document.getElementById('navBackBtn')?.addEventListener('click', () => this.navBack());
    document.getElementById('navForwardBtn')?.addEventListener('click', () => this.navForward());

    // Search input
    this.searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (this.searchClearBtn) {
        this.searchClearBtn.classList.toggle('visible', q.length > 0);
      }
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        if (q.length > 0) {
          if (this.currentView !== 'search') {
            this.navigateTo('search', false);
          }
          this.executeSearch(q);
        } else if (this.currentView === 'search') {
          this.renderSearchDefaultView();
        }
      }, 350);
    });

    this.searchClearBtn?.addEventListener('click', () => {
      if (this.searchInput) {
        this.searchInput.value = '';
        this.searchClearBtn.classList.remove('visible');
        if (this.currentView === 'search') this.renderSearchDefaultView();
      }
    });

    // Player controls
    this.playPauseBtn?.addEventListener('click', () => this.player.togglePlay());
    this.prevBtn?.addEventListener('click', () => this.player.playPrevious());
    this.nextBtn?.addEventListener('click', () => this.player.playNext());
    this.shuffleBtn?.addEventListener('click', () => {
      const active = this.player.toggleShuffle();
      this.shuffleBtn.classList.toggle('active', active);
      this.showToast(active ? 'Shuffle On' : 'Shuffle Off');
    });
    this.repeatBtn?.addEventListener('click', () => {
      const mode = this.player.toggleRepeat();
      this.repeatBtn.classList.toggle('active', mode !== 'off');
      this.repeatBtn.title = `Repeat: ${mode.toUpperCase()}`;
      this.showToast(`Repeat: ${mode.toUpperCase()}`);
    });

    // Progress Bar Seeking
    let isSeeking = false;
    this.progressBarContainer?.addEventListener('mousedown', (e) => {
      isSeeking = true;
      this.handleSeekEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (isSeeking) this.handleSeekEvent(e);
    });
    window.addEventListener('mouseup', () => {
      isSeeking = false;
    });

    // Volume Slider
    let isAdjustingVolume = false;
    this.volumeContainer?.addEventListener('mousedown', (e) => {
      isAdjustingVolume = true;
      this.handleVolumeEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (isAdjustingVolume) this.handleVolumeEvent(e);
    });
    window.addEventListener('mouseup', () => {
      isAdjustingVolume = false;
    });
    this.volumeBtn?.addEventListener('click', () => this.player.toggleMute());

    // Like in Player
    this.playerHeartBtn?.addEventListener('click', () => {
      if (this.player.currentTrack) {
        const liked = this.library.toggleLike(this.player.currentTrack);
        this.playerHeartBtn.classList.toggle('liked', liked);
        this.showToast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
        this.updateLibrarySidebar();
        if (this.currentView === 'liked') this.renderLikedSongsView();
      }
    });

    // Quality Pill Toggle (cycles 320 -> 160 -> 96 -> 320)
    this.qualityPill?.addEventListener('click', () => {
      const qualities = ['320', '160', '96'];
      let nextIdx = (qualities.indexOf(this.player.quality) + 1) % qualities.length;
      const nextQ = qualities[nextIdx];
      this.player.setQuality(nextQ);
      if (this.qualityText) this.qualityText.textContent = nextQ + ' kbps';
      this.showToast(`Audio Quality set to ${nextQ} kbps HD`);
    });

    // Lyrics Button
    document.getElementById('lyricsToggleBtn')?.addEventListener('click', () => {
      this.lyrics.toggle();
    });
    document.getElementById('lyricsCloseBtn')?.addEventListener('click', () => {
      this.lyrics.close();
    });

    // Queue Drawer Toggle
    document.getElementById('queueToggleBtn')?.addEventListener('click', () => {
      this.queueDrawer?.classList.toggle('open');
      this.renderQueue();
    });
    document.getElementById('queueCloseBtn')?.addEventListener('click', () => {
      this.queueDrawer?.classList.remove('open');
    });

    // Equalizer Modal
    document.getElementById('eqToggleBtn')?.addEventListener('click', () => {
      this.openEqModal();
    });
    document.getElementById('eqModalClose')?.addEventListener('click', () => {
      this.eqModal?.classList.remove('open');
    });

    // Equalizer sliders & presets
    document.querySelectorAll('.eq-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const band = parseInt(e.target.dataset.band, 10);
        const gain = parseFloat(e.target.value);
        this.player.setEqBand(band, gain);
      });
    });

    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.preset;
        const gains = this.player.applyPreset(preset);
        document.querySelectorAll('.eq-slider').forEach((slider, idx) => {
          if (gains[idx] !== undefined) slider.value = gains[idx];
        });
        this.showToast(`Equalizer Preset: ${preset.toUpperCase()}`);
      });
    });

    // Create Playlist Modal
    document.getElementById('createPlaylistBtn')?.addEventListener('click', () => {
      this.createPlaylistModal?.classList.add('open');
    });
    document.getElementById('closeCreatePlaylistModal')?.addEventListener('click', () => {
      this.createPlaylistModal?.classList.remove('open');
    });
    document.getElementById('savePlaylistBtn')?.addEventListener('click', () => {
      const input = document.getElementById('newPlaylistNameInput');
      const name = input ? input.value.trim() : '';
      if (name) {
        const pl = this.library.createPlaylist(name);
        this.createPlaylistModal?.classList.remove('open');
        if (input) input.value = '';
        this.updateLibrarySidebar();
        this.showToast(`Playlist "${name}" created!`);
        this.openPlaylist(pl.id);
      }
    });

    // Fullscreen Mode
    document.getElementById('fullscreenToggleBtn')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    document.getElementById('fullscreenExitBtn')?.addEventListener('click', () => {
      this.toggleFullscreen(false);
    });

    // Download button in player
    document.getElementById('downloadTrackBtn')?.addEventListener('click', () => {
      this.downloadCurrentTrack();
    });
  }

  handleSeekEvent(e) {
    if (!this.progressBarContainer || !this.player.audio.duration) return;
    const rect = this.progressBarContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.player.seek(ratio * this.player.audio.duration);
  }

  handleVolumeEvent(e) {
    if (!this.volumeContainer) return;
    const rect = this.volumeContainer.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.player.setVolume(ratio);
  }

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.player.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.player.seekRelative(5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.player.seekRelative(-5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.player.setVolume(this.player.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.player.setVolume(this.player.volume - 0.05);
          break;
        case 'KeyM':
          this.player.toggleMute();
          break;
        case 'KeyL':
          this.lyrics.toggle();
          break;
        case 'KeyQ':
          this.queueDrawer?.classList.toggle('open');
          this.renderQueue();
          break;
        case 'KeyF':
          this.toggleFullscreen();
          break;
        case 'Escape':
          this.lyrics.close();
          this.queueDrawer?.classList.remove('open');
          this.eqModal?.classList.remove('open');
          this.createPlaylistModal?.classList.remove('open');
          this.toggleFullscreen(false);
          break;
      }
    });
  }

  // Navigation
  navigateTo(view, addToHistory = true) {
    this.currentView = view;
    if (addToHistory) {
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      this.historyStack.push(view);
      this.historyIndex++;
    }
    this.updateNavButtons();

    // Update active nav link (desktop + mobile)
    document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
      link.classList.toggle('active', link.dataset.nav === view);
    });

    if (view === 'home') {
      this.loadHomeData();
    } else if (view === 'search') {
      if (this.searchInput && this.searchInput.value.trim()) {
        this.executeSearch(this.searchInput.value.trim());
      } else {
        this.renderSearchDefaultView();
      }
    } else if (view === 'liked') {
      this.renderLikedSongsView();
    } else if (view === 'local') {
      this.renderLocalFilesView();
    }
  }

  navBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const prev = this.historyStack[this.historyIndex];
      this.navigateTo(prev, false);
    }
  }

  navForward() {
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyIndex++;
      const next = this.historyStack[this.historyIndex];
      this.navigateTo(next, false);
    }
  }

  updateNavButtons() {
    const backBtn = document.getElementById('navBackBtn');
    const fwdBtn = document.getElementById('navForwardBtn');
    if (backBtn) backBtn.disabled = this.historyIndex <= 0;
    if (fwdBtn) fwdBtn.disabled = this.historyIndex >= this.historyStack.length - 1;
  }

  // --- Home View ---
  async loadHomeData() {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading top tracks and playlists...</p>
      </div>
    `;

    try {
      const resp = await fetch('/api/home');
      const data = await resp.json();
      if (data.success) {
        this.renderHome(data);
      }
    } catch (err) {
      console.error('Home load error:', err);
      this.mainView.innerHTML = `<p style="padding: 24px; color: var(--danger);">Failed to load home content. Please check connection.</p>`;
    }
  }

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  renderHome(data) {
    const greeting = this.getGreeting();
    const quickItems = (data.charts || []).slice(0, 6);

    let html = `
      <h1 class="home-greeting">${greeting}</h1>
      
      <!-- Quick Hero Grid -->
      <div class="quick-grid">
        ${quickItems.map(item => `
          <div class="quick-card" onclick="App.openPlaylist('${item.id}')">
            <img class="quick-card-art" src="${item.image}" alt="${item.title}">
            <div class="quick-card-title">${item.title}</div>
            <button class="quick-card-play" onclick="event.stopPropagation(); App.playPlaylistImmediately('${item.id}')" title="Play">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        `).join('')}
      </div>

      <!-- Quick Mood/Category Chips -->
      <div class="section-header">
        <h2 class="section-title">Jump Back In</h2>
      </div>
      <div class="cards-grid">
        ${(data.quickCategories || []).map(cat => `
          <div class="category-tile" style="background: ${cat.color};" onclick="App.searchCategory('${cat.query}')">
            ${cat.title}
          </div>
        `).join('')}
      </div>

      <!-- Featured Playlists -->
      <div class="section-header">
        <h2 class="section-title">Featured Playlists</h2>
      </div>
      <div class="cards-grid">
        ${(data.featuredPlaylists || []).map(pl => `
          <div class="music-card" onclick="App.openPlaylist('${pl.id}')">
            <div class="card-img-wrap">
              <img src="${pl.image}" alt="${pl.title}" loading="lazy">
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${pl.id}')">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="card-title">${pl.title}</div>
            <div class="card-subtitle">${pl.subtitle}</div>
          </div>
        `).join('')}
      </div>

      <!-- Top Charts -->
      <div class="section-header">
        <h2 class="section-title">Top Charts</h2>
      </div>
      <div class="cards-grid">
        ${(data.charts || []).map(chart => `
          <div class="music-card" onclick="App.openPlaylist('${chart.id}')">
            <div class="card-img-wrap">
              <img src="${chart.image}" alt="${chart.title}" loading="lazy">
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${chart.id}')">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="card-title">${chart.title}</div>
            <div class="card-subtitle">${chart.subtitle}</div>
          </div>
        `).join('')}
      </div>

      <!-- New Releases -->
      <div class="section-header">
        <h2 class="section-title">New Album Releases</h2>
      </div>
      <div class="cards-grid">
        ${(data.newAlbums || []).map(album => `
          <div class="music-card" onclick="App.openAlbum('${album.id}')">
            <div class="card-img-wrap">
              <img src="${album.image}" alt="${album.title}" loading="lazy">
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playAlbumImmediately('${album.id}')">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
            <div class="card-title">${album.title}</div>
            <div class="card-subtitle">${album.subtitle}</div>
          </div>
        `).join('')}
      </div>
    `;

    this.mainView.innerHTML = html;
  }

  searchCategory(q) {
    if (this.searchInput) this.searchInput.value = q;
    this.navigateTo('search');
    this.executeSearch(q);
  }

  // --- Search View ---
  renderSearchDefaultView() {
    const popularCategories = [
      { name: 'Pop Hits', q: 'Pop Hits', color: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' },
      { name: 'Hip-Hop', q: 'Hip Hop', color: 'linear-gradient(135deg, #831843, #ec4899)' },
      { name: 'Lo-Fi Chill', q: 'Lofi Chill', color: 'linear-gradient(135deg, #4c1d95, #8b5cf6)' },
      { name: 'Rock & Metal', q: 'Rock Classics', color: 'linear-gradient(135deg, #78350f, #f59e0b)' },
      { name: 'Bollywood Top', q: 'Bollywood Hits', color: 'linear-gradient(135deg, #064e3b, #10b981)' },
      { name: 'Workout Beats', q: 'Workout Energy', color: 'linear-gradient(135deg, #991b1b, #ef4444)' },
      { name: 'Study & Focus', q: 'Focus Piano', color: 'linear-gradient(135deg, #134e4a, #14b8a6)' },
      { name: 'Acoustic Morning', q: 'Acoustic Pop', color: 'linear-gradient(135deg, #3730a3, #6366f1)' }
    ];

    this.mainView.innerHTML = `
      <h2 class="section-title" style="margin-bottom: 16px;">Browse All Categories</h2>
      <div class="search-categories">
        ${popularCategories.map(cat => `
          <div class="category-tile" style="background: ${cat.color};" onclick="App.searchCategory('${cat.q}')">
            ${cat.name}
          </div>
        `).join('')}
      </div>
    `;
  }

  async executeSearch(query) {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Searching for "${query}"...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&quality=${this.player.quality}`);
      const data = await resp.json();

      if (!data.success || (!data.results.songs.length && !data.results.albums.length && !data.results.playlists.length)) {
        this.mainView.innerHTML = `
          <div style="padding: 60px 20px; text-align: center;">
            <h2 style="font-size: 1.5rem; margin-bottom: 8px;">No results found for "${query}"</h2>
            <p style="color: var(--text-secondary);">Please make sure your words are spelled correctly or use less or different keywords.</p>
          </div>
        `;
        return;
      }

      this.renderSearchResults(data.results, query);
    } catch (err) {
      console.error('Search error:', err);
      this.mainView.innerHTML = `<p style="padding: 24px; color: var(--danger);">Error executing search.</p>`;
    }
  }

  renderSearchResults(results, query) {
    const topSong = results.songs[0];
    const otherSongs = results.songs.slice(0, 10);

    let html = `
      <div class="search-results-top">
        ${topSong ? `
          <div>
            <h2 class="section-title" style="margin-bottom: 12px;">Top Result</h2>
            <div class="top-result-card" onclick="App.playTrack(${JSON.stringify(topSong).replace(/"/g, '&quot;')})">
              <img class="top-result-art" src="${topSong.image}" alt="${topSong.title}">
              <div class="top-result-title">${topSong.title}</div>
              <div class="top-result-meta">
                <span class="top-result-badge">Song</span>
                <span>${topSong.artist}</span>
              </div>
              <button class="card-play-btn" onclick="event.stopPropagation(); App.playTrack(${JSON.stringify(topSong).replace(/"/g, '&quot;')})">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          </div>
        ` : ''}

        <div>
          <h2 class="section-title" style="margin-bottom: 12px;">Songs</h2>
          ${this.buildSongsTable(otherSongs)}
        </div>
      </div>

      ${results.albums && results.albums.length ? `
        <div class="section-header">
          <h2 class="section-title">Albums</h2>
        </div>
        <div class="cards-grid">
          ${results.albums.map(album => `
            <div class="music-card" onclick="App.openAlbum('${album.id}')">
              <div class="card-img-wrap">
                <img src="${album.image}" alt="${album.title}" loading="lazy">
                <button class="card-play-btn" onclick="event.stopPropagation(); App.playAlbumImmediately('${album.id}')">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div class="card-title">${album.title}</div>
              <div class="card-subtitle">${album.subtitle}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${results.playlists && results.playlists.length ? `
        <div class="section-header">
          <h2 class="section-title">Playlists</h2>
        </div>
        <div class="cards-grid">
          ${results.playlists.map(pl => `
            <div class="music-card" onclick="App.openPlaylist('${pl.id}')">
              <div class="card-img-wrap">
                <img src="${pl.image}" alt="${pl.title}" loading="lazy">
                <button class="card-play-btn" onclick="event.stopPropagation(); App.playPlaylistImmediately('${pl.id}')">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div class="card-title">${pl.title}</div>
              <div class="card-subtitle">${pl.subtitle}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    this.mainView.innerHTML = html;
  }

  // --- Playlist & Album Detail Views ---
  async openPlaylist(id) {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading playlist...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/playlist/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();

      if (data.success) {
        this.renderCollectionDetail({
          type: 'Playlist',
          title: data.title,
          subtitle: data.subtitle,
          image: data.image,
          songs: data.songs || []
        });
      }
    } catch (err) {
      console.error('Playlist load error:', err);
    }
  }

  async openAlbum(id) {
    this.mainView.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div class="playing-bars"><span></span><span></span><span></span><span></span></div>
        <p style="margin-top: 12px; font-weight: 600;">Loading album...</p>
      </div>
    `;

    try {
      const resp = await fetch(`/api/album/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();

      if (data.success) {
        this.renderCollectionDetail({
          type: 'Album',
          title: data.title,
          subtitle: data.subtitle,
          image: data.image,
          year: data.year,
          songs: data.songs || []
        });
      }
    } catch (err) {
      console.error('Album load error:', err);
    }
  }

  async playPlaylistImmediately(id) {
    try {
      const resp = await fetch(`/api/playlist/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (data.success && data.songs.length) {
        this.player.setQueue(data.songs, 0);
        this.showToast(`Playing playlist "${data.title}"`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async playAlbumImmediately(id) {
    try {
      const resp = await fetch(`/api/album/${encodeURIComponent(id)}?quality=${this.player.quality}`);
      const data = await resp.json();
      if (data.success && data.songs.length) {
        this.player.setQueue(data.songs, 0);
        this.showToast(`Playing album "${data.title}"`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  renderCollectionDetail(collection) {
    const totalDuration = collection.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
    const mins = Math.floor(totalDuration / 60);

    const safeSongsJSON = JSON.stringify(collection.songs).replace(/"/g, '&quot;');

    let html = `
      <div class="detail-hero">
        <img class="detail-hero-cover" src="${collection.image}" alt="${collection.title}">
        <div class="detail-hero-info">
          <span class="detail-hero-type">${collection.type}</span>
          <h1 class="detail-hero-title">${collection.title}</h1>
          <div class="detail-hero-meta">
            ${collection.subtitle ? `<span>${collection.subtitle} • </span>` : ''}
            <span><strong>${collection.songs.length} songs</strong>, about ${mins} min</span>
          </div>
        </div>
      </div>

      <div class="detail-action-bar">
        <button class="big-play-btn" onclick="App.playCollectionQueue(${safeSongsJSON})" title="Play All">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>

      ${this.buildSongsTable(collection.songs)}
    `;

    this.mainView.innerHTML = html;
  }

  playCollectionQueue(songs) {
    if (!songs || !songs.length) return;
    this.player.setQueue(songs, 0);
  }

  // --- Liked Songs View ---
  renderLikedSongsView() {
    const liked = this.library.getLikedSongs();
    const safeSongsJSON = JSON.stringify(liked).replace(/"/g, '&quot;');

    let html = `
      <div class="detail-hero">
        <div class="library-item-icon liked-gradient" style="width: 190px; height: 190px; border-radius: var(--radius-md);">
          <svg style="width: 80px; height: 80px; fill: #fff;" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <div class="detail-hero-info">
          <span class="detail-hero-type">Playlist</span>
          <h1 class="detail-hero-title">Liked Songs</h1>
          <div class="detail-hero-meta">
            <span><strong>${liked.length} songs</strong></span>
          </div>
        </div>
      </div>

      ${liked.length ? `
        <div class="detail-action-bar">
          <button class="big-play-btn" onclick="App.playCollectionQueue(${safeSongsJSON})" title="Play All">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        ${this.buildSongsTable(liked)}
      ` : `
        <div style="padding: 60px 0; text-align: center; color: var(--text-secondary);">
          <h3>Songs you like will appear here</h3>
          <p style="margin-top: 8px;">Save songs by tapping the heart icon on any song.</p>
        </div>
      `}
    `;

    this.mainView.innerHTML = html;
  }

  // --- Local Files View ---
  renderLocalFilesView() {
    const localTracks = this.localFiles.getLocalTracks();
    const safeJSON = JSON.stringify(localTracks).replace(/"/g, '&quot;');

    let html = `
      <div class="detail-hero">
        <div class="library-item-icon local-gradient" style="width: 190px; height: 190px; border-radius: var(--radius-md);">
          <svg style="width: 80px; height: 80px; fill: #fff;" viewBox="0 0 24 24">
            <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
          </svg>
        </div>
        <div class="detail-hero-info">
          <span class="detail-hero-type">Local Collection</span>
          <h1 class="detail-hero-title">Local Music Files</h1>
          <div class="detail-hero-meta">
            <span><strong>${localTracks.length} tracks</strong></span>
          </div>
        </div>
      </div>

      <div class="drop-zone" id="localDropZone">
        <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
        <h3>Drag & drop audio files here or Click to Browse</h3>
        <p>Supports MP3, WAV, FLAC, M4A, OGG formats</p>
        <input type="file" id="localFileInput" multiple accept="audio/*" style="display: none;">
      </div>

      ${localTracks.length ? `
        <div class="detail-action-bar">
          <button class="big-play-btn" onclick="App.playCollectionQueue(${safeJSON})" title="Play All">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        ${this.buildSongsTable(localTracks)}
      ` : ''}
    `;

    this.mainView.innerHTML = html;
    this.localFiles.initDropZone();
  }

  // --- Songs Table Builder ---
  buildSongsTable(songs) {
    if (!songs || !songs.length) {
      return '<p style="color: var(--text-secondary); padding: 12px;">No songs in this list.</p>';
    }

    const currentId = this.player.currentTrack?.id;

    return `
      <table class="songs-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th>Title</th>
            <th>Album</th>
            <th class="col-dur">Duration</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${songs.map((song, idx) => {
            const isPlayingThis = (song.id === currentId && this.player.isPlaying);
            const isLiked = this.library.isLiked(song.id);
            const dur = this.formatDuration(song.duration);
            const songJSON = JSON.stringify(song).replace(/"/g, '&quot;');

            return `
              <tr class="song-row ${song.id === currentId ? 'playing' : ''}" onclick="App.playTrackFromList(${songJSON}, ${idx})">
                <td class="song-cell-num">
                  ${isPlayingThis ? `
                    <div class="playing-bars">
                      <span></span><span></span><span></span><span></span>
                    </div>
                  ` : `
                    <span class="song-num-text">${idx + 1}</span>
                    <button class="song-row-play-btn">
                      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  `}
                </td>
                <td class="song-cell-info">
                  <img class="song-cell-thumb" src="${song.image}" alt="${song.title}" loading="lazy">
                  <div class="song-cell-details">
                    <div class="song-cell-title">${song.title}</div>
                    <div class="song-cell-artist">${song.artist}</div>
                  </div>
                </td>
                <td class="song-cell-album">${song.album || '-'}</td>
                <td class="song-cell-dur">${dur}</td>
                <td class="song-cell-actions">
                  <button class="song-action-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); App.toggleSongLike(${songJSON})" title="Like">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  </button>
                  <button class="song-action-btn" onclick="event.stopPropagation(); App.player.addToQueue(${songJSON})" title="Add to Queue">
                    <svg viewBox="0 0 24 24">
                      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/>
                    </svg>
                  </button>
                  <button class="song-action-btn" onclick="event.stopPropagation(); App.downloadSong(${songJSON})" title="Download MP3">
                    <svg viewBox="0 0 24 24">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  playTrackFromList(song, index) {
    this.player.loadTrack(song);
  }

  playTrack(song) {
    this.player.loadTrack(song);
  }

  toggleSongLike(song) {
    const liked = this.library.toggleLike(song);
    this.showToast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    this.updateLibrarySidebar();
    if (this.player.currentTrack && this.player.currentTrack.id === song.id) {
      this.playerHeartBtn?.classList.toggle('liked', liked);
    }
    // Re-render current view if in liked
    if (this.currentView === 'liked') {
      this.renderLikedSongsView();
    }
  }

  // --- Dynamic Color Extraction ---
  updateAmbientColor(imageUrl) {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Avoid pure white / pure black
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness > 20 && brightness < 235) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }

        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          if (this.ambientGlow) {
            this.ambientGlow.style.background = `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, 0.38) 0%, rgba(18, 18, 18, 0) 100%)`;
          }
        }
      } catch (e) {
        // Fallback default green glow
      }
    };
  }

  // --- Player State Callbacks ---
  onTrackChange(track) {
    // Player UI
    const thumb = document.getElementById('playerThumb');
    const title = document.getElementById('playerTrackTitle');
    const artist = document.getElementById('playerTrackArtist');

    if (thumb) thumb.src = track.image;
    if (title) title.textContent = track.title;
    if (artist) artist.textContent = track.artist;

    if (this.playerHeartBtn) {
      this.playerHeartBtn.classList.toggle('liked', this.library.isLiked(track.id));
    }

    // Dynamic background glow
    this.updateAmbientColor(track.image);

    // Update Lyrics if open
    if (this.lyrics.isOpen) {
      this.lyrics.loadLyrics(track);
    }

    // Update Fullscreen overlay
    const fsCover = document.getElementById('fsCover');
    const fsTitle = document.getElementById('fsTitle');
    const fsArtist = document.getElementById('fsArtist');
    if (fsCover) fsCover.src = track.image;
    if (fsTitle) fsTitle.textContent = track.title;
    if (fsArtist) fsArtist.textContent = track.artist;

    // Refresh row active indicators
    document.querySelectorAll('.song-row').forEach(row => {
      row.classList.remove('playing');
    });
  }

  updatePlayState(isPlaying) {
    if (this.playPauseBtn) {
      this.playPauseBtn.innerHTML = isPlaying ?
        `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>` :
        `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }

    const fsPlayBtn = document.getElementById('fsPlayPauseBtn');
    if (fsPlayBtn) {
      fsPlayBtn.innerHTML = isPlaying ?
        `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>` :
        `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }
  }

  updateProgress(currentTime, duration) {
    if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatDuration(currentTime);
    if (this.totalDurationEl) this.totalDurationEl.textContent = this.formatDuration(duration);

    if (this.progressBarFill && duration > 0) {
      const pct = (currentTime / duration) * 100;
      this.progressBarFill.style.width = pct + '%';
    }

    // Lyrics sync update
    if (this.lyrics.isOpen) {
      this.lyrics.updateProgress(currentTime);
    }
  }

  updateVolumeUI(volume, isMuted) {
    if (this.volumeFill) {
      this.volumeFill.style.width = (isMuted ? 0 : volume * 100) + '%';
    }

    if (this.volumeBtn) {
      if (isMuted || volume === 0) {
        this.volumeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.73 4.73H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
      } else if (volume < 0.5) {
        this.volumeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`;
      } else {
        this.volumeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
      }
    }
  }

  // --- Queue Drawer ---
  renderQueue() {
    const listEl = document.getElementById('queueList');
    if (!listEl) return;

    if (!this.player.queue.length) {
      listEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Queue is empty.</p>';
      return;
    }

    listEl.innerHTML = this.player.queue.map((track, idx) => {
      const isCurrent = idx === this.player.queueIndex;
      return `
        <div class="library-item ${isCurrent ? 'active' : ''}" onclick="App.player.loadTrack(App.player.queue[${idx}])">
          <img class="song-cell-thumb" src="${track.image}" alt="${track.title}">
          <div class="library-item-info">
            <div class="library-item-title">${track.title}</div>
            <div class="library-item-sub">${track.artist}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Library Sidebar ---
  updateLibrarySidebar() {
    const listEl = document.getElementById('sidebarPlaylistsList');
    if (!listEl) return;

    const playlists = this.library.getPlaylists();
    listEl.innerHTML = playlists.map(pl => `
      <div class="library-item" onclick="App.openCustomPlaylist('${pl.id}')">
        <div class="library-item-icon">
          <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: #fff;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <div class="library-item-info">
          <div class="library-item-title">${pl.name}</div>
          <div class="library-item-sub">Playlist • ${pl.songs.length} songs</div>
        </div>
      </div>
    `).join('');
  }

  openCustomPlaylist(id) {
    const pl = this.library.getPlaylist(id);
    if (!pl) return;
    this.renderCollectionDetail({
      type: 'Custom Playlist',
      title: pl.name,
      subtitle: pl.description || 'Created by you',
      image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
      songs: pl.songs
    });
  }

  // --- Downloads ---
  downloadCurrentTrack() {
    if (this.player.currentTrack) {
      this.downloadSong(this.player.currentTrack);
    }
  }

  downloadSong(song) {
    if (!song) return;
    const filename = `${song.title} - ${song.artist}.mp3`;
    this.showToast(`Starting download: ${song.title}`);

    if (song.audioUrl) {
      const a = document.createElement('a');
      a.href = `/api/download?url=${encodeURIComponent(song.audioUrl)}&filename=${encodeURIComponent(filename)}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  // --- Modals & Fullscreen ---
  openEqModal() {
    this.player.initWebAudio();
    this.eqModal?.classList.add('open');
  }

  toggleFullscreen(forceState) {
    if (!this.fullscreenOverlay) return;
    const shouldOpen = forceState !== undefined ? forceState : !this.fullscreenOverlay.classList.contains('active');
    this.fullscreenOverlay.classList.toggle('active', shouldOpen);
    if (shouldOpen && this.player.currentTrack) {
      this.onTrackChange(this.player.currentTrack);
    }
  }

  // --- Toasts ---
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
