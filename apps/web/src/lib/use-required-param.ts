import { useParams } from 'react-router';

export function useRequiredParam(name: string): string {
  const value = useParams()[name];
  if (!value) throw new Error(`Route parameter ${name} is missing`);
  return value;
}
