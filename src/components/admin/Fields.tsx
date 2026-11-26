import { cloneElement, isValidElement, useId, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, LoaderCircle, Music2, Upload } from 'lucide-react';
import { uploadAudio, uploadImage } from '../../lib/api';
const errorText = (error: unknown, fallback = 'File belum dapat diunggah.') =>
  error instanceof Error ? error.message : fallback;

export function Field({
  label,
  children,
  hint,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const native =
    isValidElement<{ id?: string; 'aria-describedby'?: string }>(children) &&
    typeof children.type === 'string' &&
    ['input', 'textarea', 'select'].includes(children.type);
  const input = native
    ? cloneElement(children, { id, 'aria-describedby': hint ? hintId : undefined })
    : children;
  return (
    <div className={`admin-field ${wide ? 'wide' : ''}`}>
      <label htmlFor={native ? id : undefined}>
        <span>{label}</span>
        {!native && input}
      </label>
      {native && input}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

export function ImageField({
  value,
  onChange,
  label = 'Gambar',
  onError,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  onError: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  return (
    <div className="admin-image-field">
      <div className="admin-image-preview">
        {value ? <img src={value} alt={`${label} preview`} /> : <ImagePlus size={30} />}
      </div>
      <div>
        <strong>{label}</strong>
        <p>
          JPG, PNG, WebP, atau AVIF. Maksimal 5 MB.
          <br />
          Gambar otomatis dioptimalkan ke WebP.
        </p>
        <button
          className="button secondary small"
          type="button"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{' '}
          {uploading ? 'Mengunggah...' : 'Unggah gambar'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="file-input"
          aria-label={`Unggah ${label.toLowerCase()}`}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              onError('Ukuran gambar maksimal 5 MB.');
              event.target.value = '';
              return;
            }
            setUploading(true);
            try {
              change.current(await uploadImage(file));
            } catch (error) {
              onError(errorText(error, 'Gambar belum dapat diunggah.'));
            } finally {
              setUploading(false);
              if (input.current) input.current.value = '';
            }
          }}
        />
      </div>
    </div>
  );
}

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export function AudioField({
  value,
  onChange,
  label = 'File audio / lagu',
  onError,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  onError: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const displaySource = value || '/audio/bgm.mp3 (bawaan)';

  return (
    <div className="admin-audio-field">
      <div className={`admin-audio-badge ${value ? 'has-custom' : ''}`}>
        <Music2 size={24} />
      </div>
      <div className="admin-audio-meta">
        <strong>{label}</strong>
        <p>
          MP3, WAV, OGG, M4A, AAC, WebM, atau FLAC. Maksimal 4 MB (aman untuk Vercel &amp; Postgres).
        </p>
        <div className="admin-audio-source" title={displaySource}>
          <span>Sumber aktif:</span>
          <code>{displaySource}</code>
        </div>
        <button
          className="button secondary small"
          type="button"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{' '}
          {uploading ? 'Mengunggah audio...' : 'Unggah file audio'}
        </button>
        <input
          ref={input}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,application/ogg,audio/mp4,audio/x-m4a,audio/aac,audio/webm,audio/flac,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac"
          className="file-input"
          aria-label={`Unggah ${label.toLowerCase()}`}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_AUDIO_BYTES) {
              onError('Ukuran file audio maksimal 4 MB agar kompatibel dengan Vercel.');
              event.target.value = '';
              return;
            }
            setUploading(true);
            try {
              change.current(await uploadAudio(file));
            } catch (error) {
              onError(errorText(error, 'File audio belum dapat diunggah.'));
            } finally {
              setUploading(false);
              if (input.current) input.current.value = '';
            }
          }}
        />
      </div>
    </div>
  );
}
