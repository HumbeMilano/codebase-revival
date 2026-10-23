import { Keyboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

let explained = false;

/** Focus is synchronous with the tap so mobile browsers can open their keyboard.
 * Dictation is handled entirely by the user's keyboard; no microphone API is used. */
export function NativeInputShortcut({ targetId }: { targetId: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 shrink-0 rounded-xl"
      aria-label="Escribir o dictar con mi teclado"
      aria-controls={targetId}
      title="Escribir o dictar"
      onClick={() => {
        const field = document.getElementById(targetId);
        if (!(
          field instanceof HTMLTextAreaElement ||
          (field instanceof HTMLInputElement && ["text", "search"].includes(field.type))
        ))
          return;
        field.focus();
        if (!explained) {
          explained = true;
          toast("Para dictar, usa el micrófono de tu teclado si está disponible.");
        }
      }}
    >
      <Keyboard className="size-5" />
    </Button>
  );
}
