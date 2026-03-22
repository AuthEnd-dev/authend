import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

type NoticeVariant = "default" | "success" | "destructive";

type NoticeInput = {
  title: string;
  description?: string;
  variant?: NoticeVariant;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
};

type NoticeRecord = NoticeInput & {
  id: string;
  expiresAt: number;
  isActing: boolean;
};

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: NoticeVariant;
};

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type FeedbackContextValue = {
  showNotice: (input: NoticeInput) => string;
  dismissNotice: (id: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function variantClasses(variant: NoticeVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-500/25 bg-emerald-500/8";
    case "destructive":
      return "border-destructive/30 bg-destructive/8";
    default:
      return "border-border/70 bg-background/95";
  }
}

function buttonVariant(variant: NoticeVariant) {
  return variant === "destructive" ? "destructive" : "outline";
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (notices.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      setNotices((current) => current.filter((notice) => notice.expiresAt > currentTime));
    }, 250);

    return () => window.clearInterval(interval);
  }, [notices.length]);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const showNotice = useCallback(
    (input: NoticeInput) => {
      const id = crypto.randomUUID();
      const durationMs = input.durationMs ?? 5000;
      setNotices((current) => [
        ...current,
        {
          ...input,
          id,
          durationMs,
          expiresAt: Date.now() + durationMs,
          isActing: false,
        },
      ]);
      return id;
    },
    [],
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...options,
        resolve,
      });
    });
  }, []);

  const handleConfirmClose = useCallback((confirmed: boolean) => {
    setConfirmState((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const handleNoticeAction = useCallback(
    async (noticeId: string) => {
      const currentNotice = notices.find((notice) => notice.id === noticeId);
      if (!currentNotice?.onAction || currentNotice.isActing) {
        return;
      }

      setNotices((current) =>
        current.map((notice) => (notice.id === noticeId ? { ...notice, isActing: true } : notice)),
      );

      try {
        await currentNotice.onAction();
        dismissNotice(noticeId);
        showNotice({
          title: "Undo complete",
          description: "The previous action has been rolled back.",
          variant: "success",
          durationMs: 4000,
        });
      } catch (error) {
        setNotices((current) =>
          current.map((notice) => (notice.id === noticeId ? { ...notice, isActing: false } : notice)),
        );
        showNotice({
          title: "Undo failed",
          description: getErrorMessage(error, "The previous action could not be rolled back."),
          variant: "destructive",
          durationMs: 6000,
        });
      }
    },
    [dismissNotice, notices, showNotice],
  );

  const value = useMemo<FeedbackContextValue>(
    () => ({
      showNotice,
      dismissNotice,
      confirm,
    }),
    [confirm, dismissNotice, showNotice],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[140] flex justify-center px-4">
        <div className="flex w-full max-w-lg flex-col gap-2">
          {notices.map((notice) => {
            const secondsRemaining = Math.max(0, Math.ceil((notice.expiresAt - now) / 1000));
            const variant = notice.variant ?? "default";
            return (
              <div
                key={notice.id}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${variantClasses(variant)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{notice.title}</p>
                    {notice.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{notice.description}</p>
                    )}
                    {notice.onAction && (
                      <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                        Undo available for {secondsRemaining}s
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {notice.onAction && (
                      <Button
                        variant={buttonVariant(variant)}
                        size="sm"
                        onClick={() => void handleNoticeAction(notice.id)}
                        disabled={notice.isActing}
                        className="shadow-none"
                      >
                        {notice.isActing ? "Undoing..." : notice.actionLabel ?? "Undo"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => dismissNotice(notice.id)}
                      className="text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground">{confirmState.title}</h3>
            {confirmState.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{confirmState.description}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => handleConfirmClose(false)}>
                {confirmState.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={confirmState.variant === "destructive" ? "destructive" : "default"}
                onClick={() => handleConfirmClose(true)}
              >
                {confirmState.confirmLabel ?? "Continue"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return context;
}
