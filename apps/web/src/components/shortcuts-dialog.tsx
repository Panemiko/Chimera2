import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@chimera2/ui/components/dialog";

import { APP_SHORTCUTS } from "@/utils/shortcuts";

export default function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent>
        <DialogTitle className="mb-3">Keyboard shortcuts</DialogTitle>
        <ul className="space-y-2">
          {APP_SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <kbd className="min-w-8 rounded border border-input bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                {s.key}
              </kbd>
              <span>{s.action}</span>
              <span className="ml-auto text-xs text-muted-foreground">{s.hint}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
