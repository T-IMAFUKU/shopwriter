// src/lib/notify.ts
import { toast } from "sonner";

export type NotifyKind = "success" | "info" | "warn" | "error";
export type NotifyOptions = {
  duration?: number;
  description?: string;
};

function notify(message: string, kind: NotifyKind = "info", opts?: NotifyOptions) {
  switch (kind) {
    case "success":
      return toast.success(message, opts);
    case "error":
      return toast.error(message, opts);
    case "warn":
      return toast.warning(message, opts);
    default:
      return toast.info(message, opts);
  }
}

// 補助メソッド
notify.success = (msg: string, opts?: NotifyOptions) => toast.success(msg, opts);
notify.error = (msg: string, opts?: NotifyOptions) => toast.error(msg, opts);
notify.warn = (msg: string, opts?: NotifyOptions) => toast.warning(msg, opts);
notify.info = (msg: string, opts?: NotifyOptions) => toast.info(msg, opts);
notify.promise = toast.promise;

export { notify };
export default notify;
