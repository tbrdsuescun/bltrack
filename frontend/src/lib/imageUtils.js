/**
 * Comprime una imagen si excede un tamaño objetivo.
 * Usa HTML5 Canvas para redimensionar y comprimir.
 * 
 * @param {File} file - El archivo original
 * @param {number} targetSizeMB - Tamaño objetivo en MB (default 4MB para estar seguros bajo el límite de 5MB)
 * @param {number} maxWidthOrHeight - Ancho o alto máximo (default 1920px)
 * @param {number} quality - Calidad JPEG (0 a 1, default 0.7)
 * @returns {Promise<File>} - El archivo comprimido o el original si no es imagen o error
 */
export async function compressImage(file, targetSizeMB = 4, maxWidthOrHeight = 1920, quality = 0.7) {
  // Si no es imagen, devolver original
  if (!file.type.startsWith('image/')) return file;
  
  // Si ya es pequeño, devolver original
  if (file.size <= targetSizeMB * 1024 * 1024) return file;

  console.log(`Comprimiendo imagen ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const elem = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Lógica de redimensionamiento (mantener aspect ratio)
        if (width > height) {
            if (width > maxWidthOrHeight) {
                height *= maxWidthOrHeight / width;
                width = maxWidthOrHeight;
            }
        } else {
            if (height > maxWidthOrHeight) {
                width *= maxWidthOrHeight / height;
                height = maxWidthOrHeight;
            }
        }
        
        elem.width = width;
        elem.height = height;
        
        const ctx = elem.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Comprimir a JPEG
        ctx.canvas.toBlob((blob) => {
            if (!blob) {
                console.warn('Canvas toBlob falló, usando archivo original');
                resolve(file);
                return;
            }

            const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const newFile = new File([blob], newName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
            });

            console.log(`Comprimido ${file.name} a ${(newFile.size / 1024 / 1024).toFixed(2)} MB`);
            resolve(newFile);
        }, 'image/jpeg', quality);
      };
      
      img.onerror = (error) => {
          console.error('Error cargando imagen para comprimir', error);
          resolve(file);
      };
    };
    
    reader.onerror = (error) => {
        console.error('Error leyendo archivo', error);
        resolve(file);
    };
  });
}
