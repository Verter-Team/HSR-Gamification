// Проигрыватель: обёртка над общим движком. Таймер считается от момента показа вопроса
// по абсолютному времени, поэтому свёрнутое приложение не ставит его на паузу.
import {
  advance, applyChoice, applyTimeout, availableOptions, createSession, currentNode, isFinished,
  type Option, type ScenarioGraph, type ScenarioNode, type SessionState,
} from '@vsm/scenario-engine';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Delta {
  metric: string;
  value: number;
  key: number;
}

export interface Player {
  state: SessionState;
  node: ScenarioNode;
  options: Option[];
  deltas: Delta[];
  timeLeft: number | null;
  timeShare: number;
  choose: (optionId: string) => void;
  next: () => void;
  finished: boolean;
}

export function usePlayer(graph: ScenarioGraph, onFinish: (state: SessionState) => void): Player {
  const [state, setState] = useState<SessionState>(() => createSession(graph));
  const [deltas, setDeltas] = useState<Delta[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const shownAt = useRef(performance.now());
  const stepKey = useRef('');
  const finishedRef = useRef(false);

  const node = currentNode(graph, state);
  const key = `${state.currentNodeId}:${state.events.length}`;
  if (stepKey.current !== key) {
    stepKey.current = key;
    shownAt.current = performance.now();
  }

  const apply = useCallback((update: (current: SessionState) => SessionState) => {
    setState((current) => {
      const next = update(current);
      if (next === current) return current;
      const changes = Object.keys(next.metrics)
        .map((metric) => ({ metric, value: next.metrics[metric] - current.metrics[metric] }))
        .filter((change) => change.value !== 0)
        .map((change) => ({ ...change, key: Date.now() + Math.random() }));
      if (changes.length) setDeltas(changes);
      return next;
    });
  }, []);

  const choose = useCallback((optionId: string) => {
    const reactionMs = performance.now() - shownAt.current;
    const expected = stepKey.current;
    apply((current) => {
      if (`${current.currentNodeId}:${current.events.length}` !== expected) return current;
      const active = currentNode(graph, current);
      // Нажатие после истечения таймера (например, приложение было свёрнуто) считается тайм-аутом
      if (active.kind === 'choice' && active.timer && reactionMs > active.timer.seconds * 1000) return applyTimeout(graph, current);
      return applyChoice(graph, current, optionId, reactionMs);
    });
  }, [apply, graph]);

  const next = useCallback(() => {
    const expected = stepKey.current;
    apply((current) => (`${current.currentNodeId}:${current.events.length}` === expected ? advance(graph, current) : current));
  }, [apply, graph]);

  const timer = node.kind === 'choice' ? node.timer : undefined;
  useEffect(() => {
    if (!timer || isFinished(state)) return;
    const deadline = shownAt.current + timer.seconds * 1000;
    const timeoutKey = key;
    let frame = 0;
    const tick = () => {
      const current = performance.now();
      setNow(current);
      if (current >= deadline) {
        apply((value) => (`${value.currentNodeId}:${value.events.length}` === timeoutKey ? applyTimeout(graph, value) : value));
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [apply, graph, key, state, timer]);

  useEffect(() => {
    if (isFinished(state) && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(state);
    }
  }, [onFinish, state]);

  const total = timer ? timer.seconds * 1000 : 0;
  const left = timer ? Math.max(0, shownAt.current + total - now) : null;

  return {
    state,
    node,
    options: availableOptions(graph, state),
    deltas,
    timeLeft: left,
    timeShare: timer && left !== null ? left / total : 1,
    choose,
    next,
    finished: isFinished(state),
  };
}
