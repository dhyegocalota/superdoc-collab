import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ACCENT_COLOR_LABEL, EDITOR_THEME_PRESET_LABELS, THEME_LABEL } from './editor-copy';
import { EditorThemePreset, isEditorThemePreset, isHexColor, pickerColorOf } from './editor-theme';
import { useEditorTheme } from './use-editor-theme';

const NO_PRESET_VALUE = '';

export function ThemeButton() {
  const { choice, choose } = useEditorTheme();
  const checkedPreset = 'preset' in choice ? choice.preset : NO_PRESET_VALUE;

  function choosePreset(value: string): void {
    if (!isEditorThemePreset(value)) return;
    choose({ preset: value });
  }

  function chooseAccent(value: string): void {
    if (!isHexColor(value)) return;
    choose({ accent: value });
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={THEME_LABEL}>
              <Palette aria-hidden />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{THEME_LABEL}</TooltipContent>
      </Tooltip>
      <PopoverContent className="flex flex-col gap-3">
        <ToggleGroup type="single" value={checkedPreset} onValueChange={choosePreset} aria-label={THEME_LABEL} className="flex-wrap gap-1">
          {Object.values(EditorThemePreset).map((preset) => (
            <ToggleGroupItem key={preset} value={preset} className="w-auto rounded-md px-3 first:rounded-md last:rounded-md not-first:ml-0">
              {EDITOR_THEME_PRESET_LABELS[preset]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Label className="justify-between">
          {ACCENT_COLOR_LABEL}
          <input
            type="color"
            value={pickerColorOf(choice)}
            onChange={(event) => chooseAccent(event.currentTarget.value)}
            className="h-8 w-12 cursor-pointer rounded-md border bg-transparent p-0.5"
          />
        </Label>
      </PopoverContent>
    </Popover>
  );
}
