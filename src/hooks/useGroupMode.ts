import { useState } from 'react';

export interface FolderItem {
  handle: any;
  name: string;
  hasTxt?: boolean;
}

export interface FolderImage {
  name: string;
  url: string;
}

// Cek apakah folder berisi minimal 1 file .txt (tanda sudah pernah di-generate)
const folderHasTxt = async (dirHandle: any): Promise<boolean> => {
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
        return true;
      }
    }
  } catch {
    // abaikan error scan, anggap belum ada
  }
  return false;
};

export const useGroupMode = () => {
  const [rootHandle, setRootHandle] = useState<any | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderItem | null>(null);
  const [folderImages, setFolderImages] = useState<FolderImage[]>([]);
  const [loading, setLoading] = useState(false);

  // Buka folder utama, lalu daftarkan semua subfolder (kategori) di dalamnya.
  // Foto TIDAK di-flatten seperti mode satuan — cukup daftar foldernya.
  const openRootDirectory = async (): Promise<boolean> => {
    if (!('showDirectoryPicker' in window)) {
      alert("Browser Anda tidak mendukung fitur buka folder (File System Access API). Mohon gunakan Google Chrome versi terbaru di PC/Laptop.");
      return false;
    }
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const subs: FolderItem[] = [];
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') {
          subs.push({ handle: entry, name: entry.name });
        }
      }
      subs.sort((a, b) => a.name.localeCompare(b.name));
      // Tandai folder yang sudah berisi file .txt (sudah pernah di-generate)
      await Promise.all(
        subs.map(async (s) => {
          s.hasTxt = await folderHasTxt(s.handle);
        })
      );
      setRootHandle(dirHandle);
      setFolders(subs);
      setActiveFolder(null);
      setFolderImages([]);
      return true;
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Error opening root directory:', err);
        alert('Gagal membuka folder utama: ' + (err?.message || err));
      }
      return false;
    }
  };

  // Pilih 1 folder kategori: scan foto di dalamnya (1 level) hanya untuk preview.
  const selectFolder = async (folder: FolderItem) => {
    setLoading(true);
    try {
      const imgs: FolderImage[] = [];
      // @ts-ignore
      for await (const entry of folder.handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          if (file.type.startsWith('image/')) {
            imgs.push({ name: entry.name, url: URL.createObjectURL(file) });
          }
        }
      }
      imgs.sort((a, b) => a.name.localeCompare(b.name));
      setActiveFolder(folder);
      setFolderImages(imgs);
    } catch (err: any) {
      console.error('Error scanning folder:', err);
      alert('Gagal membaca isi folder: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Tulis file .txt ke folder kategori aktif.
  // Jika nama sudah ada, otomatis jadi "nama 2.txt", "nama 3.txt", dst.
  const writeTxt = async (baseName: string, content: string): Promise<{ success: boolean; fileName?: string; error?: string }> => {
    if (!activeFolder) {
      return { success: false, error: 'Belum ada folder kategori yang dipilih' };
    }
    try {
      const safeBase = baseName.replace(/[\\/:*?"<>|]/g, '-').trim();
      let counter = 0;
      let newName = '';
      let exists = true;

      while (exists) {
        newName = counter === 0 ? `${safeBase}.txt` : `${safeBase} ${counter + 1}.txt`;
        try {
          await activeFolder.handle.getFileHandle(newName);
          counter++;
        } catch (e: any) {
          if (e.name === 'NotFoundError') {
            exists = false;
          } else {
            throw e;
          }
        }
      }

      const fh = await activeFolder.handle.getFileHandle(newName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      // Tandai folder aktif sebagai sudah di-generate (update state tanpa rescan)
      setFolders((prev) =>
        prev.map((f) =>
          f.name === activeFolder.name ? { ...f, hasTxt: true } : f
        )
      );
      setActiveFolder((prev) =>
        prev && prev.name === activeFolder.name ? { ...prev, hasTxt: true } : prev
      );
      return { success: true, fileName: newName };
    } catch (err: any) {
      console.error('Error writing txt:', err);
      return { success: false, error: err?.message || String(err) };
    }
  };

  return {
    rootHandle,
    folders,
    activeFolder,
    folderImages,
    loading,
    openRootDirectory,
    selectFolder,
    writeTxt,
  };
};
