import { useState } from 'react';

export interface FileItem {
  handle: any;
  name: string;
  url: string;
}

export const useFileSystem = () => {
  const [directoryHandle, setDirectoryHandle] = useState<any | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRenaming, setIsRenaming] = useState(false);

  const openDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert("Browser Anda tidak mendukung fitur buka folder (File System Access API). Mohon gunakan Google Chrome versi terbaru di PC/Laptop.");
      return;
    }
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });
      setDirectoryHandle(dirHandle);

      const fileList: FileItem[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          if (file.type.startsWith('image/')) {
            fileList.push({
              handle: entry,
              name: entry.name,
              url: URL.createObjectURL(file),
            });
          }
        }
      }
      
      // Sort alphabetically
      fileList.sort((a, b) => a.name.localeCompare(b.name));
      
      setFiles(fileList);
      setCurrentIndex(0);
    } catch (err: any) {
      console.error('Error opening directory:', err);
      if (err.name !== 'AbortError') {
        alert('Gagal membuka folder: ' + err.message);
      }
    }
  };

  const renameCurrentFile = async (newNameBase: string) => {
    if (!directoryHandle || files.length === 0 || currentIndex >= files.length) return false;
    
    setIsRenaming(true);
    const currentItem = files[currentIndex];
    
    try {
      // Get extension from original file
      const ext = currentItem.name.split('.').pop() || 'jpg';
      // Bersihkan nama file dari karakter terlarang di Windows/OS lain (\/:*?"<>|)
      const safeNameBase = newNameBase.replace(/[\\/:*?"<>|]/g, '-');
      
      let counter = 0;
      let newName = '';
      let fileHandleExists = true;
      
      while (fileHandleExists) {
        let nameToTry = safeNameBase;
        if (counter === 1) {
          nameToTry = `${safeNameBase} KAIT`;
        } else if (counter > 1) {
          nameToTry = `${safeNameBase} KAIT ${counter}`;
        }
        newName = `${nameToTry}.${ext}`;
        
        try {
          // Jika berhasil dapat fileHandle, berarti file sudah ada, kita harus lanjut loop (counter++)
          await directoryHandle.getFileHandle(newName);
          counter++;
        } catch (e: any) {
          // Jika error-nya NotFoundError, berarti nama file ini aman untuk digunakan
          if (e.name === 'NotFoundError') {
            fileHandleExists = false;
          } else {
            throw e; // Error lain (misal permission denied) kita lempar ke atas
          }
        }
      }
      
      // Read original file
      const file = await currentItem.handle.getFile();
      
      // Create new file
      const newFileHandle = await directoryHandle.getFileHandle(newName, { create: true });
      const writable = await newFileHandle.createWritable();
      
      // Write data
      await writable.write(file);
      await writable.close();
      
      // Delete old file
      await directoryHandle.removeEntry(currentItem.name);
      
      // Revoke old URL to prevent memory leak
      URL.revokeObjectURL(currentItem.url);
      
      // Update state: remove current file from queue
      setFiles(prev => prev.filter((_, i) => i !== currentIndex));
      // currentIndex stays the same, which effectively selects the next file in the array
      
      setIsRenaming(false);
      return true;
    } catch (err) {
      console.error('Error renaming file:', err);
      setIsRenaming(false);
      return false;
    }
  };

  return {
    directoryHandle,
    files,
    currentIndex,
    setCurrentIndex,
    openDirectory,
    renameCurrentFile,
    isRenaming,
    currentFile: files[currentIndex] || null
  };
};
