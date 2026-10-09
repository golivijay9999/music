const express = require('express');
const cors = require('cors');
const path = require('path');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function cleanString(str) {
  if (!str) return '';
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function formatImage(imgUrl) {
  if (!imgUrl) return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
  return imgUrl
    .replace('150x150.jpg', '500x500.jpg')
    .replace('50x50.jpg', '500x500.jpg')
    .replace('http://', 'https://');
}

function decryptMediaUrl(encUrl, quality = '320') {
  if (!encUrl) return '';
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    let url = decrypted.toString(CryptoJS.enc.Utf8);
    if (!url) return '';
    if (quality === '320') {
      url = url.replace(/_96\.mp4|_160\.mp4/, '_320.mp4');
    } else if (quality === '160') {
      url = url.replace(/_96\.mp4|_320\.mp4/, '_160.mp4');
    } else if (quality === '96') {
      url = url.replace(/_160\.mp4|_320\.mp4/, '_96.mp4');
    }
    return url.replace('http://', 'https://');
  } catch (err) {
    console.error('Decryption error:', err.message);
    return '';
  }
}

function formatSongItem(item, quality = '320') {
  if (!item) return null;
  const moreInfo = item.more_info || {};
  const encMedia = moreInfo.encrypted_media_url || item.encrypted_media_url || '';
  const audioUrl = decryptMediaUrl(encMedia, quality);

  // Extract artist names
  let artistName = '';
  if (moreInfo.artistMap && moreInfo.artistMap.primary_artists && moreInfo.artistMap.primary_artists.length > 0) {
    artistName = moreInfo.artistMap.primary_artists.map(a => a.name).join(', ');
  } else if (moreInfo.music) {
    artistName = moreInfo.music;
  } else if (item.subtitle) {
    artistName = item.subtitle.split(' - ')[0] || item.subtitle;
  }

  const durationSec = parseInt(moreInfo.duration || item.duration || 0, 10);

  return {
    id: item.id || '',
    title: cleanString(item.title || item.song || 'Unknown Title'),
    artist: cleanString(artistName || 'Unknown Artist'),
    album: cleanString(moreInfo.album || item.album || ''),
    albumId: moreInfo.album_id || item.album_id || '',
    image: formatImage(item.image),
    duration: durationSec,
    year: item.year || moreInfo.year || '',
    language: item.language || '',
    audioUrl,
    hasLyrics: moreInfo.has_lyrics === 'true' || moreInfo.has_lyrics === true,
    copyright: cleanString(moreInfo.copyright_text || '')
  };
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'Aura Music', version: '1.0.0' });
});

// 2. Homepage Content
app.get('/api/home', async (req, res) => {
  try {
    const url = 'https://www.jiosaavn.com/api.php?__call=content.getHomepageData&_format=json&_marker=0&api_version=4&ctx=web6dot0';
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await resp.json();

    const charts = (data.charts || []).slice(0, 10).map(c => ({
      id: c.id || c.listid,
      title: cleanString(c.title),
      subtitle: cleanString(c.subtitle || 'Top Chart'),
      image: formatImage(c.image),
      count: c.count || c.list_count || 0,
      type: 'playlist'
    }));

    const featuredPlaylists = (data.featured_playlists || []).slice(0, 12).map(p => ({
      id: p.id || p.listid,
      title: cleanString(p.title),
      subtitle: cleanString(p.subtitle || 'Featured Playlist'),
      image: formatImage(p.image),
      count: p.list_count || 0,
      type: 'playlist'
    }));

    const newAlbums = (data.new_albums || []).slice(0, 12).map(a => ({
      id: a.id,
      title: cleanString(a.title),
      subtitle: cleanString(a.subtitle || a.music || 'New Release'),
      image: formatImage(a.image),
      year: a.year,
      type: 'album'
    }));

    // Curated genres & moods for Spotify-style category tiles
    const quickCategories = [
      { id: 'cat-pop', title: 'Today\'s Top Hits', query: 'Top Hits', color: 'linear-gradient(135deg, #1e3a8a, #3b82f6)' },
      { id: 'cat-chill', title: 'Chill & Lo-Fi', query: 'Lofi Chill', color: 'linear-gradient(135deg, #4c1d95, #8b5cf6)' },
      { id: 'cat-rock', title: 'Rock Classics', query: 'Rock Classics', color: 'linear-gradient(135deg, #831843, #ec4899)' },
      { id: 'cat-hiphop', title: 'Hip-Hop Vibes', query: 'Hip Hop', color: 'linear-gradient(135deg, #78350f, #f59e0b)' },
      { id: 'cat-workout', title: 'Workout Energy', query: 'Workout', color: 'linear-gradient(135deg, #064e3b, #10b981)' },
      { id: 'cat-focus', title: 'Deep Focus & Study', query: 'Study Focus', color: 'linear-gradient(135deg, #134e4a, #14b8a6)' }
    ];

    res.json({
      success: true,
      charts,
      featuredPlaylists,
      newAlbums,
      quickCategories
    });
  } catch (err) {
    console.error('Home API error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Search (Songs, Albums, Playlists)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const type = req.query.type || 'all';
  const quality = req.query.quality || '320';

  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required' });
  }

  try {
    const results = {
      songs: [],
      albums: [],
      playlists: []
    };

    if (type === 'all' || type === 'songs') {
      const songUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=25&p=1&q=${encodeURIComponent(query)}`;
      const songResp = await fetch(songUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const songData = await songResp.json();
      if (songData && songData.results) {
        results.songs = songData.results
          .map(item => formatSongItem(item, quality))
          .filter(Boolean);
      }
    }

    if (type === 'all' || type === 'albums') {
      const albumUrl = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=12&p=1&q=${encodeURIComponent(query)}`;
      const albumResp = await fetch(albumUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const albumData = await albumResp.json();
      if (albumData && albumData.results) {
        results.albums = albumData.results.map(a => ({
          id: a.id,
          title: cleanString(a.title),
          subtitle: cleanString(a.subtitle || a.music || a.artist || 'Album'),
          image: formatImage(a.image),
          year: a.year || '',
          type: 'album'
        }));
      }
    }

    if (type === 'all' || type === 'playlists') {
      const playlistUrl = `https://www.jiosaavn.com/api.php?__call=search.getPlaylistResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=12&p=1&q=${encodeURIComponent(query)}`;
      const playlistResp = await fetch(playlistUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const playlistData = await playlistResp.json();
      if (playlistData && playlistData.results) {
        results.playlists = playlistData.results.map(p => ({
          id: p.id,
          title: cleanString(p.title),
          subtitle: cleanString(p.subtitle || 'Playlist'),
          image: formatImage(p.image),
          count: p.count || p.list_count || 0,
          type: 'playlist'
        }));
      }
    }

    res.json({
      success: true,
      query,
      results
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Playlist details
app.get('/api/playlist/:id', async (req, res) => {
  const { id } = req.params;
  const quality = req.query.quality || '320';
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&_marker=0&api_version=4&ctx=web6dot0&listid=${encodeURIComponent(id)}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await resp.json();

    const songs = (data.list || [])
      .map(item => formatSongItem(item, quality))
      .filter(Boolean);

    res.json({
      success: true,
      id: data.id,
      title: cleanString(data.title),
      subtitle: cleanString(data.subtitle || data.header_desc || ''),
      image: formatImage(data.image),
      count: songs.length,
      songs
    });
  } catch (err) {
    console.error('Playlist fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Album details
app.get('/api/album/:id', async (req, res) => {
  const { id } = req.params;
  const quality = req.query.quality || '320';
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${encodeURIComponent(id)}&_format=json&_marker=0&api_version=4&ctx=web6dot0`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await resp.json();

    const songs = (data.list || [])
      .map(item => formatSongItem(item, quality))
      .filter(Boolean);

    res.json({
      success: true,
      id: data.id,
      title: cleanString(data.title),
      subtitle: cleanString(data.subtitle || data.artist || 'Album'),
      image: formatImage(data.image),
      year: data.year,
      count: songs.length,
      songs
    });
  } catch (err) {
    console.error('Album fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Song details
app.get('/api/song/:id', async (req, res) => {
  const { id } = req.params;
  const quality = req.query.quality || '320';
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(id)}&_format=json&_marker=0&api_version=4&ctx=web6dot0`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await resp.json();

    const raw = (data.songs && data.songs[0]) || data[id];
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Song not found' });
    }

    const song = formatSongItem(raw, quality);
    res.json({ success: true, song });
  } catch (err) {
    console.error('Song fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Synced Karaoke Lyrics (LRCLIB + fallback)
app.get('/api/lyrics', async (req, res) => {
  const { artist, title, duration } = req.query;
  if (!title) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  // Clean title: remove "(From ...)", "(Official Video)", "Feat.", etc.
  const cleanTitle = title
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/feat\..*/i, '')
    .replace(/ft\..*/i, '')
    .trim();

  const cleanArtist = (artist || '').split(',')[0].trim();

  try {
    let lrcUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
    if (cleanArtist) lrcUrl += `&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (duration) lrcUrl += `&duration=${encodeURIComponent(duration)}`;

    const resp = await fetch(lrcUrl, {
      headers: {
        'User-Agent': 'AuraMusicApp/1.0 (https://github.com)'
      }
    });

    if (resp.ok) {
      const data = await resp.json();
      return res.json({
        success: true,
        syncedLyrics: data.syncedLyrics || null,
        plainLyrics: data.plainLyrics || null
      });
    }

    // Fallback: search LRCLIB if exact get didn't match
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`;
    const searchResp = await fetch(searchUrl, {
      headers: { 'User-Agent': 'AuraMusicApp/1.0' }
    });

    if (searchResp.ok) {
      const searchData = await searchResp.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        const top = searchData[0];
        return res.json({
          success: true,
          syncedLyrics: top.syncedLyrics || null,
          plainLyrics: top.plainLyrics || null
        });
      }
    }

    res.json({ success: false, message: 'Lyrics not found' });
  } catch (err) {
    console.error('Lyrics error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// 8. Direct MP3 Download Proxy
app.get('/api/download', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) {
    return res.status(400).send('URL required');
  }

  try {
    const audioResp = await fetch(url);
    if (!audioResp.ok) {
      return res.status(audioResp.status).send('Failed to fetch audio stream');
    }

    const safeFilename = (filename || 'track.mp3').replace(/[^a-zA-Z0-9_\-\. ]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'audio/mp4');

    const arrayBuf = await audioResp.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Download failed');
  }
});

// Catch-all route to serve SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🎵 Aura Music - Ad-Free Spotify Experience`);
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
