import { useCallback, useEffect, useState } from "react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement() {
  const fullscreenDocument = document as FullscreenDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

export function useMobileFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(fullscreenElement()));
    syncFullscreen();

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    setFullscreenMessage("");

    try {
      if (fullscreenElement()) {
        const fullscreenDocument = document as FullscreenDocument;
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await fullscreenDocument.webkitExitFullscreen?.();
        }
        return;
      }

      const element = document.documentElement as FullscreenElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen({ navigationUI: "hide" });
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else {
        setFullscreenMessage("Tento prohlížeč neumí přepnout stránku do celé obrazovky. Na iPhonu použijte Sdílet a Přidat na plochu.");
      }
    } catch {
      setFullscreenMessage("Celá obrazovka se nepodařila zapnout. Na mobilu ji prohlížeč povolí jen po klepnutí na tlačítko.");
    }
  }, []);

  return {
    fullscreenMessage,
    isFullscreen,
    toggleFullscreen,
  };
}
