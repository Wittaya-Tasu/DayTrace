import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({title,children,onClose,error}:{title:string;children:ReactNode;onClose:()=>void;error?:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return ()=>d?.close();},[]);
  return <dialog ref={ref} className="sheet" aria-labelledby="sheet-title" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}>
    <div className="sheet-content"><div className="sheet-handle"/><header className="sheet-header"><h2 id="sheet-title">{title}</h2><button className="icon-button" aria-label="ปิด" onClick={onClose}><X size={23}/></button></header>{error&&<p className="error" role="alert">{error}</p>}{children}</div>
  </dialog>;
}
