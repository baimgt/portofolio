import { useEffect, useRef, useState } from 'react';
import { Music2, Play, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import { Field, AudioField } from './Fields';
import { soundEngine } from '../../lib/sound';
import type { AppSettings } from '../../types';

const VOLUME_PRESETS = [40, 65, 85, 100];

export function SoundEditor({
  value,
  onChange,
  onError,
}: {
  value: AppSettings;
  onChange: (value: AppSettings) => void;
  onError: (error: string) => void;
}) {
  const soundUrl = value.soundUrl ?? '';
  const soundVolume = typeof value.soundVolume === 'number' ? value.soundVolume : 80;
  const sfxVolume = typeof value.sfxVolume === 'number' ? value.sfxVolume : 80;

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewSrc = soundUrl || '/audio/bgm.mp3';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, soundVolume / 100));
  }, [soundVolume]);

  useEffect(() => {
    setPreviewError('');
    setPlayingPreview(false);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.load();
  }, [previewSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const togglePreview = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingPreview) {
      audio.pause();
      setPlayingPreview(false);
      return;
    }
    setPreviewError('');
    audio.volume = Math.max(0, Math.min(1, soundVolume / 100));
    try {
      await audio.play();
      setPlayingPreview(true);
    } catch {
      setPreviewError('File audio tidak dapat diputar. Pastikan URL atau format audio valid.');
      setPlayingPreview(false);
    }
  };

  return (
    <>
      <div className="admin-section-title">
        <Volume2 size={20} />
        <div>
          <h2>Suara &amp; musik latar.</h2>
          <p>
            Unggah lagu langsung dari sini dan atur tingkat volume musik maupun efek klik agar pas
            didengar pengunjung.
          </p>
        </div>
      </div>

      <div className="admin-sound-stack">
        <div className="admin-editor-section">
          <h3>Lagu latar (BGM)</h3>
          <AudioField
            value={soundUrl}
            onChange={(url) => onChange({ ...value, soundUrl: url })}
            label="File musik latar"
            onError={onError}
          />
          <Field
            label="URL file audio (opsional)"
            hint="Terisi otomatis saat kamu mengunggah lagu. Bisa juga memakai link https://... atau kosongkan untuk memakai /audio/bgm.mp3 bawaan."
            wide
          >
            <input
              value={soundUrl}
              placeholder="/uploads/... atau https://..."
              onChange={(event) => onChange({ ...value, soundUrl: event.target.value })}
            />
          </Field>

          <div className="admin-audio-preview-box">
            <div className="admin-audio-preview-top">
              <div>
                <Music2 size={16} />
                <span>Pratinjau audio ({soundVolume}%)</span>
              </div>
              <div className="admin-audio-preview-actions">
                <button type="button" className="button secondary small" onClick={togglePreview}>
                  {playingPreview ? <Square size={13} /> : <Play size={13} />}
                  {playingPreview ? 'Hentikan preview' : 'Putar preview'}
                </button>
                {soundUrl && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => onChange({ ...value, soundUrl: '' })}
                  >
                    <RotateCcw size={13} />
                    Reset ke bawaan
                  </button>
                )}
              </div>
            </div>
            <audio
              ref={audioRef}
              src={previewSrc}
              controls
              loop
              preload="metadata"
              onPlay={() => setPlayingPreview(true)}
              onPause={() => setPlayingPreview(false)}
              onEnded={() => setPlayingPreview(false)}
              onError={() => {
                setPlayingPreview(false);
                if (soundUrl) {
                  setPreviewError('Audio gagal dimuat. Periksa kembali URL atau unggah ulang.');
                }
              }}
            />
            {previewError && (
              <p className="admin-audio-error" role="alert">
                {previewError}
              </p>
            )}
          </div>
        </div>

        <div className="admin-editor-section">
          <h3>Pengaturan volume</h3>
          <div className="admin-volume-card">
            <div className="admin-volume-head">
              <div>
                <strong>Volume lagu latar</strong>
                <small>
                  Mengatur kekerasan lagu saat tombol suara ON diaktifkan pengunjung (default
                  sebelumnya hanya 42%).
                </small>
              </div>
              <span className="admin-volume-badge">
                {soundVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {soundVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={soundVolume}
              className="admin-volume-slider"
              aria-label="Volume lagu latar"
              onChange={(event) =>
                onChange({ ...value, soundVolume: Number(event.target.value) })
              }
            />
            <div className="admin-volume-presets">
              {VOLUME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={soundVolume === preset ? 'active' : ''}
                  onClick={() => onChange({ ...value, soundVolume: preset })}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          <div className="admin-volume-card">
            <div className="admin-volume-head">
              <div>
                <strong>Volume efek interaksi &amp; ambient bawaan</strong>
                <small>
                  Mengatur suara klik tombol, hover menu, tarikan kartu identitas, serta ambient
                  synth jika lagu tidak tersedia.
                </small>
              </div>
              <span className="admin-volume-badge">
                {sfxVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {sfxVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sfxVolume}
              className="admin-volume-slider"
              aria-label="Volume efek suara"
              onChange={(event) => onChange({ ...value, sfxVolume: Number(event.target.value) })}
            />
            <div className="admin-volume-presets">
              {VOLUME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={sfxVolume === preset ? 'active' : ''}
                  onClick={() => onChange({ ...value, sfxVolume: preset })}
                >
                  {preset}%
                </button>
              ))}
              <button
                type="button"
                className="test-sfx-btn"
                onClick={() => soundEngine.previewEffect(sfxVolume)}
              >
                Tes efek suara
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
