import { abort } from "process";
import { useState, useEffect, useRef, useCallback } from "react";

type ModelStatus = "unknown" | "warming" | "ready" | "error";

const SCALEDOWN_WINDOW_MS = 120000
const PING_BUFFER_MS = 20000
const PING_TIMEOUT_MS = 60000

export function useModelWarmup() {
  const [modelStatus, setmodelStatus] = useState<ModelStatus>("unknown");
  const [ragUrl, setRagUrl] = useState<string | null>(null);

  const lastActivityRef = useRef<number>(Date.now())
  const pingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        console.log("Config fetched:", data);
        setRagUrl(data.ragUrl);
      })
      .catch((err) => {
        console.error("Failed to fetch config:", err);
        setmodelStatus("error");
      });
  }, []);

  const ping = useCallback(async (url: string) => {
    if (abortRef.current) abortRef.current.abort()

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
    lastActivityRef.current = Date.now()

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query: 'hi', history: [], stream: false}),
        signal: ctrl.signal
      })

      clearTimeout(t)
      abortRef.current = null;
      return {ok: resp.ok, aborted: false}
    } catch (error) {
      clearTimeout(t)
      abortRef.current = null 
      const isAbort = error instanceof Error && error.name == 'AbortError'
      return {ok: false, aborted: isAbort}
    }
  }, [])

  const scheduler = useCallback((url:string) => {
    if(pingTimerRef.current) clearTimeout(pingTimerRef.current);

    const inactive = Date.now() - lastActivityRef.current 
    const untilScaledown = SCALEDOWN_WINDOW_MS - inactive 
    const delay = Math.max(0, untilScaledown - PING_BUFFER_MS)

    pingTimerRef.current = setTimeout(() => {
      setmodelStatus("warming")
      ping(url).then(({ok, aborted}) => {
        if(ok){
          setmodelStatus('ready')
          scheduler(url)
        } else if (aborted){
          setmodelStatus("warming")
          scheduler(url)
        } else {
          setmodelStatus('error')
          console.error('error pinging model')
        }
      })
    }, delay)
  }, [ping])


    useEffect(()=>{
      if(!ragUrl) return

      setmodelStatus('warming')
      ping(ragUrl).then(({ok, aborted}) =>{
        if(ok){
          setmodelStatus('ready')
          scheduler(ragUrl)
        } else if (aborted){
          setmodelStatus("warming")
          scheduler(ragUrl)
        } else {
          setmodelStatus('error')
        }
      })

      return () => {
        if(pingTimerRef.current) clearTimeout(pingTimerRef.current)
        if (abortRef.current) abortRef.current.abort()
      }
    },[ragUrl, ping, scheduler])


    const recordActivity = useCallback(()=>{
      lastActivityRef.current = Date.now() 
      if(abortRef.current){
        abortRef.current.abort()
        abortRef.current = null
      }
      if(ragUrl) scheduler(ragUrl)
    },[ragUrl, scheduler])

    return { modelStatus, recordActivity };
}
