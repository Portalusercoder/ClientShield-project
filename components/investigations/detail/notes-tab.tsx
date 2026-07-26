"use client";

import {
  addInvestigationNoteAction,
  deleteInvestigationNoteAction,
  editInvestigationNoteAction,
} from "@/app/(dashboard)/investigations/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { TabBaseProps } from "./shared";

export function NotesTab({
  investigation,
  canAct,
  closed,
  isPending,
  runAction,
}: TabBaseProps) {
  return (
    <div className="space-y-4">
      {canAct && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Add note</CardTitle>
            <CardDescription>Analyst collaboration notes</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              action={(fd) => {
                fd.set("groupId", investigation.id);
                runAction(
                  () => addInvestigationNoteAction(fd),
                  "Note added"
                );
              }}
            >
              <textarea
                name="content"
                required
                rows={3}
                placeholder="Write an analyst note…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm" disabled={isPending}>
                Add note
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {investigation.notes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted">
            No notes yet.
          </CardContent>
        </Card>
      ) : (
        investigation.notes.map((note) => (
          <Card key={note.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {note.authorName || note.authorEmail || "Analyst"}
              </CardTitle>
              <CardDescription>
                {formatDateTime(note.createdAt)}
                {note.editedAt
                  ? ` · edited ${formatDateTime(note.editedAt)}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canAct && !closed ? (
                <form
                  className="space-y-3"
                  action={(fd) => {
                    fd.set("groupId", investigation.id);
                    fd.set("noteId", note.id);
                    runAction(
                      () => editInvestigationNoteAction(fd),
                      "Note updated"
                    );
                  }}
                >
                  <textarea
                    name="content"
                    required
                    rows={3}
                    defaultValue={note.content}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={isPending}>
                      Save edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={isPending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("groupId", investigation.id);
                        fd.set("noteId", note.id);
                        runAction(
                          () => deleteInvestigationNoteAction(fd),
                          "Note deleted"
                        );
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {note.content}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
