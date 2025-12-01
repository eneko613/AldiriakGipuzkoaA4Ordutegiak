import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, AlertCircle, Train, CheckCircle, CalendarDays } from 'lucide-react';
import { parseGTFS } from './utils/gtfs';
import { generatePDF } from './utils/pdf';
import { ParsedTrip, ProcessingStatus } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle', message: '' });
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<{ toBrinkola: ParsedTrip[], toIrun: ParsedTrip[], dateUsed: string } | null>(null);
  
  // Initialize with today's date in local time YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ step: 'idle', message: '' });
      setData(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    try {
      setStatus({ step: 'reading', message: 'Iniciando lectura del archivo...' });
      
      const result = await parseGTFS(file, selectedDate, (msg) => {
        setStatus({ step: 'processing', message: msg });
      });

      setData(result);
      setStatus({ step: 'done', message: 'Procesamiento completado con éxito.' });
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      setStatus({ step: 'error', message: `Error: ${msg}` });
    }
  };

  const handleDownload = () => {
    if (!data) return;
    setStatus({ step: 'generating', message: 'Generando PDF...' });
    setTimeout(() => {
        try {
            generatePDF(data.toBrinkola, data.toIrun, data.dateUsed);
            setStatus({ step: 'done', message: 'PDF Descargado.' });
        } catch (e) {
            console.error(e);
            setStatus({ step: 'error', message: 'Error generando PDF.' });
        }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border-t-8 border-renfe-cercanias">
        
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-renfe-cercanias text-white flex items-center justify-center rounded-full">
            <Train size={32} />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Horarios Cercanías Gipuzkoa
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Generador de PDF personalizado por fecha.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          
          {/* Date Selection */}
          <div className="w-full">
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Fecha de circulación
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <CalendarDays size={20} />
              </div>
              <input
                type="date"
                id="date"
                name="date"
                required
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setData(null); // Reset data when date changes
                  setStatus({ step: 'idle', message: '' });
                }}
                className="focus:ring-renfe-primary focus:border-renfe-primary block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-3 border px-4"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Selecciona el día para el que quieres generar el horario.</p>
          </div>

          {/* File Upload Section */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Archivo GTFS (.zip)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors
                ${file ? 'border-renfe-primary bg-purple-50' : 'border-gray-300 hover:border-renfe-secondary'}`}
            >
              <div className="space-y-1 text-center">
                <Upload className={`mx-auto h-12 w-12 ${file ? 'text-renfe-primary' : 'text-gray-400'}`} />
                <div className="flex text-sm text-gray-600 justify-center">
                  <span className="relative font-medium text-renfe-primary hover:text-renfe-secondary">
                    {file ? file.name : "Sube el archivo fomento_transit.zip"}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Formato ZIP requerido
                </p>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".zip" 
              onChange={handleFileChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleProcess}
              disabled={!file || status.step === 'processing' || status.step === 'reading'}
              className={`w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white 
                ${!file ? 'bg-gray-300 cursor-not-allowed' : 'bg-renfe-primary hover:bg-renfe-secondary focus:ring-2 focus:ring-offset-2 focus:ring-renfe-primary'}
                transition-all shadow-sm`}
            >
               {status.step === 'processing' || status.step === 'reading' ? 'Filtrando y Procesando...' : '1. Procesar Datos'}
            </button>

            <button
              onClick={handleDownload}
              disabled={!data || status.step === 'generating'}
              className={`w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white 
                ${!data ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-900 focus:ring-2 focus:ring-offset-2 focus:ring-gray-900'}
                transition-all shadow-sm`}
            >
               {status.step === 'generating' ? 'Generando...' : '2. Descargar PDF'}
            </button>
          </div>

          {/* Status Messages */}
          {status.message && (
            <div className={`rounded-md p-4 flex items-start ${
              status.step === 'error' ? 'bg-red-50 text-red-800' : 
              status.step === 'done' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'
            }`}>
              <div className="flex-shrink-0">
                {status.step === 'error' ? <AlertCircle size={20} /> : 
                 status.step === 'done' ? <CheckCircle size={20} /> : <FileText size={20} />}
              </div>
              <div className="ml-3 text-sm font-medium">
                {status.message}
              </div>
            </div>
          )}

          {/* Preview Statistics */}
          {data && status.step === 'done' && (
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Resumen para el {data.dateUsed}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded shadow-sm border-l-4 border-renfe-cercanias">
                  <div className="text-sm text-gray-500">Irun &rarr; Brinkola</div>
                  <div className="text-2xl font-bold text-gray-800">{data.toBrinkola.length} trenes</div>
                </div>
                <div className="bg-white p-4 rounded shadow-sm border-l-4 border-renfe-primary">
                  <div className="text-sm text-gray-500">Brinkola &rarr; Irun</div>
                  <div className="text-2xl font-bold text-gray-800">{data.toIrun.length} trenes</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="border-t border-gray-200 pt-6">
             <p className="text-xs text-gray-400 text-center">
                Instrucciones: El PDF generado contendrá únicamente los trenes que circulan en la fecha indicada, teniendo en cuenta festivos y excepciones del operador.
             </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;