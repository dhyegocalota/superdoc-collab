import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ACCENT_COLOR_LABEL, EDITOR_THEME_PRESET_LABELS, THEME_LABEL } from './editor-copy';
import { EditorThemePreset, isHexColor, pickerColorOf, swatchTestId } from './editor-theme';
import { useEditorTheme } from './use-editor-theme';

export function ThemeButton() {
  const { choice, choose } = useEditorTheme();
  const checkedPreset = 'preset' in choice ? choice.preset : null;

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
        <div role="group" aria-label={THEME_LABEL} className="flex flex-wrap gap-1">
          {Object.values(EditorThemePreset).map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={checkedPreset === preset}
              onClick={() => choose({ preset })}
              className="aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
            >
              <span
                aria-hidden
                data-testid={swatchTestId(preset)}
                style={{ backgroundColor: pickerColorOf({ preset }) }}
                className="size-3 rounded-full border"
              />
              {EDITOR_THEME_PRESET_LABELS[preset]}
            </Button>
          ))}
        </div>
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
