import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GIPUZKOA_STATIONS, StationDef } from '../constants';
import { ParsedTrip } from '../types';

export const generatePDF = (toBrinkola: ParsedTrip[], toIrun: ParsedTrip[], dateStr: string) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const generateTable = (title: string, trips: ParsedTrip[], stations: StationDef[]) => {
    // Columns: [Station 1, Station 2, ...]
    // Removed the "Service Days" column as requested since we filter by specific date
    
    const headRow = stations.map(s => s.estacion);
    
    const bodyRows = trips.map(trip => {
      const row: string[] = [];
      stations.forEach(st => {
        const time = trip.stops[st.codigo];
        row.push(time || '-'); // dash if train doesn't stop here
      });
      return row;
    });

    doc.addPage();
    if (doc.getNumberOfPages() === 1 && trips === toBrinkola) {
        doc.deletePage(1); 
        doc.addPage(); 
    }

    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Fecha de circulación: ${dateStr}`, 14, 20);

    autoTable(doc, {
      startY: 25,
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      styles: {
        fontSize: 6,
        cellPadding: 0.5,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.1,
        lineColor: [200, 200, 200]
      },
      headStyles: {
        fillColor: [227, 6, 19], // Renfe Red
        textColor: [255, 255, 255],
        fontSize: 5.5, // Slightly smaller to fit station names
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: 1
      },
      // Rotate header text if needed, but horizontal A4 usually fits abbreviations.
      // Let's keep it standard but adjust margins.
      margin: { top: 25, left: 5, right: 5 },
      didDrawPage: (data) => {
         // Header is repeated automatically
      }
    });
  };

  // 1. Irun -> Brinkola
  const stationsToBrinkola = [...GIPUZKOA_STATIONS];
  generateTable("Horarios: Irun -> Brinkola", toBrinkola, stationsToBrinkola);

  // 2. Brinkola -> Irun
  const stationsToIrun = [...GIPUZKOA_STATIONS].reverse();
  generateTable("Horarios: Brinkola -> Irun", toIrun, stationsToIrun);

  doc.save(`Cercanias_Gipuzkoa_${dateStr.replace(/\//g, '-')}.pdf`);
};