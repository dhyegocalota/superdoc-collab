export type SelectedHeaderSelection = { rangeLabel: string; editCount: number };

type SelectedHeaderProps = {
  selection: SelectedHeaderSelection | null;
  hasVersion: boolean;
  isPhoneLayout: boolean;
  onClear: () => void;
  onViewVersion: () => void;
};

export function SelectedHeader(props: SelectedHeaderProps): never {
  throw new Error('SelectedHeader is not implemented');
}
