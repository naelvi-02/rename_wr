import { useState } from 'react';

export interface FileItem {
  handle: any;
  parentDirHandle: any;
  name: string;
  url: string;
  path: string;
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
      
      const scanDirectory = async (currentDirHandle: any, currentRelPath: string = '') => {
        // @ts-ignore
        for await (const entry of currentDirHandle.values()) {
          const entryRelPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            if (file.type.startsWith('image/')) {
              fileList.push({
                handle: entry,
                parentDirHandle: currentDirHandle,
                name: entry.name,
                url: URL.createObjectURL(file),
                path: entryRelPath,
              });
            }
          } else if (entry.kind === 'directory') {
            await scanDirectory(entry, entryRelPath);
          }
        }
      };

      await scanDirectory(dirHandle, '');
      
      // Sort berdasarkan folder path terlebih dahulu secara hierarkis (natural numeric)
      fileList.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
      
      setFiles(fileList);
      setCurrentIndex(0);
    } catch (err: any) {
      console.error('Error opening directory:', err);
      if (err.name !== 'AbortError') {
        alert('Gagal membuka folder: ' + err.message);
      }
    }
  };

  const renameCurrentFile = async (newNameBase: string): Promise<{success: boolean, error?: string}> => {
    if (!directoryHandle || files.length === 0 || currentIndex >= files.length) {
      return { success: false, error: 'Directory handle not found or no files left' };
    }
    
    setIsRenaming(true);
    const currentItem = files[currentIndex];
    
    try {
      // Get extension from original file
      const ext = currentItem.name.split('.').pop() || 'jpg';
      // Collect existing file names (excluding the current file being renamed)
      // so the destination never overwrites another file.
      const existingNames = new Set<string>();
      // @ts-ignore
      for await (const entry of currentItem.parentDirHandle.values()) {
        if (entry.kind === 'file' && entry.name !== currentItem.name) {
          existingNames.add(entry.name);
        }
      }

      // Repeated scans represent a KAIT photo, not a generic duplicate.
      // Keep KAIT as a suffix so downstream template processing can associate
      // it with the primary jewelry photo.
      const baseName = newNameBase.trim() || currentItem.name.replace(/\.\w+$/, '');
      let newName = `${baseName}.${ext}`;
      let counter = 1;
      while (existingNames.has(newName)) {
        const kaitSuffix = counter === 1 ? ' KAIT' : ` KAIT ${counter}`;
        newName = `${baseName}${kaitSuffix}.${ext}`;
        counter += 1;
      }

      // Read original file
      const file = await currentItem.handle.getFile();

      // Create new file
      const newFileHandle = await currentItem.parentDirHandle.getFileHandle(newName, { create: true });
      const writable = await newFileHandle.createWritable();

      // Write data
      await writable.write(file);
      await writable.close();

      // Delete old file
      await currentItem.parentDirHandle.removeEntry(currentItem.name);
      
      // Revoke old URL to prevent memory leak
      URL.revokeObjectURL(currentItem.url);
      
      // Update state: remove current file from queue
      setFiles(prev => prev.filter((_, i) => i !== currentIndex));
      // currentIndex stays the same, which effectively selects the next file in the array
      
      setIsRenaming(false);
      return { success: true };
    } catch (err: any) {
      console.error('Error renaming file:', err);
      setIsRenaming(false);
      return { success: false, error: err.message || err.toString() };
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
