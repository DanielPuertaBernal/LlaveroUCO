import { useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import Button from '@/shared/components/ui/Button';

/**
 * Componente para subir archivos Excel
 */
export default function FileUploader({ onFile, accept = '.xlsx,.xls', label = 'Subir archivo Excel', loading = false }) {
  const inputRef = useRef(null);

  function handleChange(e) {
    const file = e.target.files[0];
    if (file) {
      onFile(file);
      e.target.value = ''; // reset para permitir mismo archivo
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      <Button
        type="button"
        onClick={() => inputRef.current.click()}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {loading ? 'Importando...' : label}
      </Button>
    </div>
  );
}
