import { useEffect, useState, type ReactNode } from "react";
import { copy } from "./copy";

type BraveNavigator = Navigator & {
  brave?: { isBrave?: () => Promise<boolean> };
};

export function detectBrave(): Promise<boolean> {
  const brave = (navigator as BraveNavigator).brave;
  if (typeof brave?.isBrave !== "function") return Promise.resolve(false);
  return Promise.resolve(brave.isBrave()).then((value) => value === true).catch(() => false);
}

export function BrowserGate({
  detect,
  children,
}: {
  detect: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    setBlocked(null);
    void Promise.resolve()
      .then(() => detect())
      .then((value) => {
        if (alive) setBlocked(value === true);
      })
      .catch(() => {
        if (alive) setBlocked(false);
      });
    return () => {
      alive = false;
    };
  }, [detect]);

  if (blocked === null) return null;
  if (blocked) return <p>{copy.unsupportedBrowser}</p>;
  return children;
}
