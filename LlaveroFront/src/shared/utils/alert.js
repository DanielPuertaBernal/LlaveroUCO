import Swal from '@/shared/lib/swal';
import { toast } from 'sonner';

export function showSuccess(message) {
  toast.success(message);
}

export function showError(message) {
  toast.error(message);
}

export function showWarning(message) {
  toast.warning(message);
}

export function showConfirm(title, text) {
  return Swal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
  });
}
