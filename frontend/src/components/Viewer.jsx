import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Printer, XCircle, Loader2, Lock } from 'lucide-react';

const VITE_URL = import.meta.env.VITE_API_URL;
const API_BASE = VITE_URL 
  ? (VITE_URL.endsWith('/api/files') ? VITE_URL : `${VITE_URL}/api/files`)
  : `http://${window.location.hostname}:8081/api/files`;

export default function Viewer() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFile();
    
    // Cleanup listener for print completion
    const handleAfterPrint = () => {
      confirmPrintAndCleanup();
    };
    
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [token]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const fetchFile = async () => {
    try {
      const response = await axios.get(`${API_BASE}/view/${token}`, {
        responseType: 'arraybuffer',
        headers: {
          Accept: 'application/pdf'
        }
      });

      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
    } catch (err) {
      setError("This link is expired or has already been used for printing.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const iframe = document.getElementById('pdf-frame');
    if (iframe) {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        // Fallback for browsers that block iframe.print()
        window.print();
      }
    } else {
      window.print();
    }
  };

  const confirmPrintAndCleanup = async () => {
    try {
      await axios.post(`${API_BASE}/print-complete/${token}`);
      alert("Print completed. Access has been revoked and file deleted from server.");
      navigate('/');
    } catch (err) {
      console.error("Cleanup failed", err);
    }
  };

  if (loading) {
    return (
      <div className="viewer-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="animate-spin" size={48} />
        <p style={{ marginTop: '1rem' }}>Decrypting Secure Document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="viewer-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <XCircle size={64} color="#ef4444" />
        <h1 style={{ marginTop: '2rem' }}>Access Denied</h1>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Back Home</button>
      </div>
    );
  }

  return (
    <div className="viewer-container">
      <div className="viewer-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Lock size={20} color="#10b981" />
          <span style={{ fontWeight: 600 }}>Secure One-Time Viewer</span>
        </div>
        <button className="btn btn-primary" onClick={handlePrint}>
          <Printer size={18} />
          Print Now
        </button>
      </div>
      
      <iframe 
        id="pdf-frame"
        src={pdfUrl}
        title="Secure PDF Viewer"
      />

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #pdf-frame, #pdf-frame * { visibility: visible; }
          #pdf-frame {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            height: 100% !important;
            margin: 0;
            padding: 0;
            border: none;
          }
          .viewer-toolbar { display: none !important; }
        }
      `}} />
    </div>
  );
}

