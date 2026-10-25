import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";

export function managementError(error: unknown) {
  const failure = error as { code?: string; message?: string };
  toast.error(failure.code === "23503" ? "This item is in use. Remove its linked items first." : failure.code === "23505" ? "That code already exists." : failure.message ?? "Could not save changes");
}

export function RecordActions({ name, onEdit, onDelete, disabled = false }: { name: string; onEdit: () => void; onDelete: () => Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return <div className="flex shrink-0 gap-1">
    <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Edit ${name}`} title={`Edit ${name}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
    <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Delete ${name}`} title={`Delete ${name}`} onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /></Button>
    <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
      <AlertDialogHeader><AlertDialogTitle>Delete {name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. Linked records must be removed first.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete(); setOpen(false); } catch (error) { managementError(error); } finally { setBusy(false); } }}>{busy ? "Deleting…" : "Delete"}</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}