/**
 * library.js - Local Storage Management for Aura Music
 * Handles Liked Songs, Custom Playlists, and Playback History.
 */

class MusicLibrary {
  constructor() {
    this.LIKED_KEY = 'aura_liked_songs';
    this.PLAYLISTS_KEY = 'aura_playlists';
    this.HISTORY_KEY = 'aura_recent_history';

    this.likedSongs = this.load(this.LIKED_KEY, []);
    this.playlists = this.load(this.PLAYLISTS_KEY, [
      {
        id: 'favorites',
        name: 'My Chill Mix',
        description: 'Personal favorite tracks',
        createdAt: Date.now(),
        songs: []
      }
    ]);
    this.history = this.load(this.HISTORY_KEY, []);
  }

  load(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
      return fallback;
    }
  }

  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  // --- Liked Songs ---
  isLiked(songId) {
    if (!songId) return false;
    return this.likedSongs.some(s => s.id === songId);
  }

  toggleLike(song) {
    if (!song || !song.id) return false;
    const index = this.likedSongs.findIndex(s => s.id === song.id);
    let state = false;
    if (index >= 0) {
      this.likedSongs.splice(index, 1);
      state = false;
    } else {
      this.likedSongs.unshift(song);
      state = true;
    }
    this.save(this.LIKED_KEY, this.likedSongs);
    return state;
  }

  getLikedSongs() {
    return this.likedSongs;
  }

  // --- Custom Playlists ---
  getPlaylists() {
    return this.playlists;
  }

  getPlaylist(id) {
    return this.playlists.find(p => p.id === id);
  }

  createPlaylist(name, description = '') {
    const newPlaylist = {
      id: 'pl_' + Date.now(),
      name: name.trim() || 'My Playlist #' + (this.playlists.length + 1),
      description: description.trim(),
      createdAt: Date.now(),
      songs: []
    };
    this.playlists.push(newPlaylist);
    this.save(this.PLAYLISTS_KEY, this.playlists);
    return newPlaylist;
  }

  deletePlaylist(id) {
    this.playlists = this.playlists.filter(p => p.id !== id);
    this.save(this.PLAYLISTS_KEY, this.playlists);
  }

  addToPlaylist(playlistId, song) {
    const pl = this.getPlaylist(playlistId);
    if (!pl) return false;
    if (!pl.songs.some(s => s.id === song.id)) {
      pl.songs.push(song);
      this.save(this.PLAYLISTS_KEY, this.playlists);
      return true;
    }
    return false;
  }

  removeFromPlaylist(playlistId, songId) {
    const pl = this.getPlaylist(playlistId);
    if (!pl) return false;
    pl.songs = pl.songs.filter(s => s.id !== songId);
    this.save(this.PLAYLISTS_KEY, this.playlists);
    return true;
  }

  // --- Recently Played ---
  addToHistory(song) {
    if (!song || !song.id) return;
    this.history = this.history.filter(s => s.id !== song.id);
    this.history.unshift(song);
    if (this.history.length > 30) {
      this.history.pop();
    }
    this.save(this.HISTORY_KEY, this.history);
  }

  getHistory() {
    return this.history;
  }
}

window.MusicLibrary = MusicLibrary;
