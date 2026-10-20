import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { DEVICE_OFFER_LABEL, DEVICE_REFUSAL_COPY } from '@/features/local-preview/local-preview-copy';
import type { DevicePreparation, DocumentUpload } from './use-upload-document';

function DeviceOffer({ devicePreparation }: { devicePreparation: DevicePreparation }) {
  if (devicePreparation.refusal !== null)
    return <p className="text-sm text-muted-foreground">{DEVICE_REFUSAL_COPY[devicePreparation.refusal]}</p>;
  return (
    <Button variant="outline" onClick={devicePreparation.start}>
      {DEVICE_OFFER_LABEL}
    </Button>
  );
}

export function UploadMessage({ upload }: { upload: DocumentUpload }) {
  if (upload.message === null) return null;
  return (
    <div className="space-y-2">
      <ErrorMessage>{upload.message}</ErrorMessage>
      {upload.devicePreparation && <DeviceOffer devicePreparation={upload.devicePreparation} />}
    </div>
  );
}
