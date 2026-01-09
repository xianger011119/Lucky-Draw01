
import { Group } from '../types';

export function parseCSV(text: string): string[] {
  // 處理可能的引號與各種換行符號
  return text
    .split(/\r?\n/)
    .map(line => line.split(',')[0].replace(/^["']|["']$/g, '').trim())
    .filter(name => name.length > 0);
}

export function downloadGroupsAsCSV(groups: Group[]) {
  let csvContent = "\uFEFFGroup ID,Team Name,Member Name\n";
  
  groups.forEach((group, index) => {
    group.members.forEach(member => {
      csvContent += `${index + 1},"${group.name}","${member.name}"\n`;
    });
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `grouping_results_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
