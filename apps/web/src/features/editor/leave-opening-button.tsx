import { AppRoute } from '@superdoc-collab/types';
import { useNavigate } from 'react-router';
import { useEscapeKey } from '@/lib/use-escape-key';
import { BackToDocumentsButton } from './back-to-documents-button';

export function LeaveOpeningButton() {
  const navigate = useNavigate();
  useEscapeKey({ isEnabled: true, onEscape: () => void navigate(AppRoute.Documents) });
  return <BackToDocumentsButton />;
}
