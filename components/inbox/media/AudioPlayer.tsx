"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Pause, Play } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc } from "./media-utils";

const RATES = [1, 1.5, 2] as const;

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Alturas (20 a 100%) da onda: a mesma para a mesma mensagem, sem depender do arquivo de áudio.
 * É DECORATIVA: inventada a partir do id, não representa o volume real do áudio (o arquivo não é
 * analisado). Quem informa o progresso de verdade é o controle de busca e o par "atual / total".
 */
function alturasDaOnda(semente: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 16777619);
  return Array.from({ length: 32 }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return 20 + (h % 81);
  });
}

interface Props {
  messageId: string;
  isOutbound: boolean;
  /** Fonte alternativa para mídia de NOTA interna (#1863, F3) — ver ImageMedia. */
  src?: string;
}

/** Player de voz estilo WhatsApp: play/pause, progresso seekável, tempo, 1x/1.5x/2x. */
export function AudioPlayer({ messageId, isOutbound, src }: Props) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [rateIdx, setRateIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration);
    const onEnded = () => setPlaying(false);
    const onError = () => setFailed(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    };
  }, []);

  if (failed) return <MediaUnavailable kind="Áudio" className="h-12 w-60" />;

  // ponytail: OGG streams report Infinity at loadedmetadata; self-heal when refined
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  };

  const cycleRate = () => {
    const next = (rateIdx + 1) % RATES.length;
    setRateIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = RATES[next]!;
  };

  const seek = (value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setCurrent(value);
  };

  const fracao = safeDuration > 0 ? Math.min(1, current / safeDuration) : 0;
  const barras = alturasDaOnda(messageId);

  return (
    <div className="flex w-64 max-w-full items-center gap-2 py-1">
      <audio ref={audioRef} src={src ?? mediaSrc(messageId)} preload="metadata" />
      <button
        type="button"
        aria-label={playing ? t("Pausar áudio") : t("Reproduzir áudio")}
        onClick={toggle}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          isOutbound
            ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
            : "bg-primary/10 text-primary hover:bg-primary/20",
        )}
      >
        {playing ? (
          <Pause size={20} weight="fill" aria-hidden />
        ) : (
          <Play size={20} weight="fill" aria-hidden />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="relative flex h-7 items-center gap-px rounded-sm has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-current has-[input:focus-visible]:ring-offset-1 has-[input:focus-visible]:ring-offset-transparent">
          {barras.map((altura, i) => {
            const tocada = fracao > 0 && (i + 1) / barras.length <= fracao + 1 / barras.length / 2;
            return (
              <span
                key={i}
                data-testid="barra-do-audio"
                data-altura={altura}
                data-tocada={tocada}
                style={{ height: `${altura}%` }}
                className={cn("w-[3px] flex-1 rounded-full bg-current", tocada ? "opacity-100" : "opacity-40")}
              />
            );
          })}
          <input
            type="range"
            aria-label={t("Progresso do áudio")}
            aria-valuetext={`${fmt(current)} ${t("de")} ${fmt(safeDuration)}`}
            min="0"
            max={String(safeDuration || 1)}
            step="0.1"
            value={current}
            onChange={(e) => seek(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <span className="text-xs tabular-nums opacity-80">
          {fmt(current)} / {fmt(safeDuration)}
        </span>
      </div>
      <button
        type="button"
        aria-label={`${t("Velocidade de reprodução")}: ${RATES[rateIdx]}x`}
        onClick={cycleRate}
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
          isOutbound
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {RATES[rateIdx]}x
      </button>
    </div>
  );
}
