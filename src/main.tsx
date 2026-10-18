import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/sarabun/thai-400.css';
import '@fontsource/sarabun/thai-500.css';
import '@fontsource/sarabun/thai-600.css';
import '@fontsource/sarabun/thai-700.css';
import '@fontsource/sarabun/latin-400.css';
import '@fontsource/sarabun/latin-600.css';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string}>{
  state={error:''};
  static getDerivedStateFromError(e:Error){return {error:e.message};}
  render(){return this.state.error?<main className="boot"><h1>เปิด DayTrace ไม่สำเร็จ</h1><p role="alert">{this.state.error}</p><p>ข้อมูลเดิมยังเก็บอยู่ กรุณาปิดและเปิดแอพอีกครั้ง หลีกเลี่ยงการล้างข้อมูลเว็บ</p><button onClick={()=>location.reload()}>ลองเปิดใหม่</button></main>:this.props.children;}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
