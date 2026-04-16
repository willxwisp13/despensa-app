// ============================================
// BASE DE DATOS INDEXEDDB
// ============================================

let db = null;
let productoSeleccionado = null;
let scannerActivo = false;

// Elementos DOM
const modalScanner = document.getElementById('modalScanner');
const modalProducto = document.getElementById('modalProducto');
const modalManual = document.getElementById('modalManual');
const modalAcciones = document.getElementById('modalAcciones');
const productList = document.getElementById('productList');
const buscador = document.getElementById('buscador');
const btnModoEscaneo = document.getElementById('btnModoEscaneo');

// Inicializar base de datos
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DespensaDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('productos')) {
        const store = db.createObjectStore('productos', { keyPath: 'codigo_barras' });
        store.createIndex('nombre', 'nombre', { unique: false });
        store.createIndex('categoria', 'categoria', { unique: false });
        store.createIndex('fecha_caducidad', 'fecha_caducidad', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('movimientos')) {
        const store = db.createObjectStore('movimientos', { autoIncrement: true });
        store.createIndex('codigo_barras', 'codigo_barras', { unique: false });
        store.createIndex('fecha', 'fecha', { unique: false });
      }
    };
  });
}

// Obtener producto
function obtenerProducto(codigo) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['productos'], 'readonly');
    const store = transaction.objectStore('productos');
    const request = store.get(codigo);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Guardar producto
function guardarProducto(producto) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['productos'], 'readwrite');
    const store = transaction.objectStore('productos');
    const request = store.put(producto);
    request.onsuccess = () => {
      registrarMovimiento(producto.codigo_barras, 'entrada', producto.cantidad);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Registrar movimiento
function registrarMovimiento(codigo, tipo, cantidad) {
  const transaction = db.transaction(['movimientos'], 'readwrite');
  const store = transaction.objectStore('movimientos');
  store.add({
    codigo_barras: codigo,
    tipo: tipo,
    cantidad: cantidad,
    fecha: new Date().toISOString()
  });
}

// Actualizar cantidad
function actualizarCantidad(codigo, delta) {
  return new Promise((resolve, reject) => {
    obtenerProducto(codigo).then(producto => {
      if (producto) {
        const nuevaCantidad = Math.max(0, producto.cantidad + delta);
        producto.cantidad = nuevaCantidad;
        const transaction = db.transaction(['productos'], 'readwrite');
        const store = transaction.objectStore('productos');
        const request = store.put(producto);
        request.onsuccess = () => {
          registrarMovimiento(codigo, delta > 0 ? 'entrada' : 'salida', Math.abs(delta));
          resolve();
        };
        request.onerror = () => reject(request.error);
      } else {
        reject('Producto no encontrado');
      }
    });
  });
}

// Eliminar producto
function eliminarProducto(codigo) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['productos'], 'readwrite');
    const store = transaction.objectStore('productos');
    const request = store.delete(codigo);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Obtener todos los productos
function obtenerTodosProductos() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['productos'], 'readonly');
    const store = transaction.objectStore('productos');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// ESCÁNER
// ============================================

function iniciarScanner() {
  modalScanner.style.display = 'flex';
  
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector('#video'),
      constraints: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    locator: {
      patchSize: "medium",
      halfSample: true
    },
    decoder: {
      readers: [
        "ean_reader",
        "ean_8_reader",
        "code_128_reader",
        "code_39_reader",
        "upc_reader",
        "upc_e_reader"
      ]
    }
  }, (err) => {
    if (err) {
      console.error(err);
      alert('Error al iniciar la cámara');
      return;
    }
    Quagga.start();
    scannerActivo = true;
  });
  
  Quagga.onDetected((result) => {
    if (result && result.codeResult) {
      const codigo = result.codeResult.code;
      Quagga.stop();
      scannerActivo = false;
      modalScanner.style.display = 'none';
      procesarCodigo(codigo);
    }
  });
}

function detenerScanner() {
  if (scannerActivo) {
    Quagga.stop();
    scannerActivo = false;
  }
}

// ============================================
// OPEN FOOD FACTS (BÚSQUEDA AUTOMÁTICA)
// ============================================

// Mostrar/ocultar indicador de carga
function mostrarCargando(mostrar) {
    let loader = document.getElementById('loadingIndicator');
    if (!loader && mostrar) {
        loader = document.createElement('div');
        loader.id = 'loadingIndicator';
        loader.innerHTML = '<div class="loader">🔍 Buscando producto en la base de datos...</div>';
        loader.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:10px; z-index:9999; box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        document.body.appendChild(loader);
    } else if (!mostrar && loader) {
        loader.remove();
    }
}

// Buscar producto en Open Food Facts por código de barras
async function buscarEnOpenFoodFacts(codigo) {
    try {
        mostrarCargando(true);
        
        const respuesta = await fetch(`https://world.openfoodfacts.org/api/v0/product/${codigo}.json`);
        const datos = await respuesta.json();
        
        if (datos.status === 1 && datos.product) {
            const producto = datos.product;
            
            return {
                encontrado: true,
                nombre: producto.product_name_es || producto.product_name || "Producto sin nombre",
                marca: producto.brands || "",
                categoria: extraerCategoria(producto.categories_tags),
                cantidad: producto.quantity || "",
                imagen: producto.image_url || "",
                ingredientes: producto.ingredients_text_es || producto.ingredients_text || "",
                codigo_barras: codigo
            };
        } else {
            return { encontrado: false, codigo_barras: codigo };
        }
    } catch (error) {
        console.error("Error al consultar Open Food Facts:", error);
        return { encontrado: false, codigo_barras: codigo, error: true };
    } finally {
        mostrarCargando(false);
    }
}

// Función auxiliar para extraer categoría
function extraerCategoria(tags) {
    if (!tags || tags.length === 0) return "Otros";
    
    const mapaCategorias = {
        "en:beverages": "Bebidas",
        "en:dairy": "Lácteos",
        "en:fruits": "Frutas",
        "en:vegetables": "Verduras",
        "en:meats": "Carnes",
        "en:frozen-foods": "Congelados",
        "en:snacks": "Snacks",
        "en:canned-foods": "Conservas"
    };
    
    for (const tag of tags) {
        if (mapaCategorias[tag]) {
            return mapaCategorias[tag];
        }
    }
    return "Alimentos";
}

// Mostrar miniatura del producto
function mostrarMiniatura(urlImagen) {
    let imgContainer = document.getElementById('imagenProducto');
    if (!imgContainer) {
        imgContainer = document.createElement('div');
        imgContainer.id = 'imagenProducto';
        imgContainer.style.cssText = 'text-align:center; margin-bottom:15px;';
        const form = document.getElementById('formProducto');
        if (form) {
            form.insertBefore(imgContainer, form.firstChild);
        }
    }
    imgContainer.innerHTML = `<img src="${urlImagen}" style="max-width:100px; max-height:100px; border-radius:8px; object-fit:cover;" onerror="this.style.display='none'">`;
}

// Mostrar formulario con datos pre-rellenados
function mostrarFormularioConDatos(producto) {
    document.getElementById('codigoBarras').value = producto.codigo_barras;
    document.getElementById('nombre').value = producto.nombre;
    document.getElementById('categoria').value = producto.categoria;
    document.getElementById('cantidad').value = "1";
    document.getElementById('fechaCaducidad').value = "";
    document.getElementById('modalTitle').textContent = '✨ Producto detectado automáticamente';
    
    if (producto.imagen) {
        mostrarMiniatura(producto.imagen);
    }
    
    modalProducto.style.display = 'flex';
}

// Mostrar formulario manual
function mostrarFormularioProducto(codigo = '') {
    document.getElementById('codigoBarras').value = codigo;
    document.getElementById('nombre').value = '';
    document.getElementById('cantidad').value = '1';
    document.getElementById('fechaCaducidad').value = '';
    document.getElementById('modalTitle').textContent = codigo ? 'Nuevo producto (manual)' : 'Editar producto';
    
    // Limpiar miniatura si existe
    const imgContainer = document.getElementById('imagenProducto');
    if (imgContainer) {
        imgContainer.innerHTML = '';
    }
    
    modalProducto.style.display = 'flex';
}

// Confirmar si quiere añadir más cantidad a producto existente
function mostrarConfirmacionAñadir(productoExistente, infoNuevo) {
    const confirmar = confirm(
        `📦 "${productoExistente.nombre}" ya existe en tu despensa.\n\n` +
        `Cantidad actual: ${productoExistente.cantidad}\n` +
        `¿Quieres AÑADIR 1 unidad más?`
    );
    if (confirmar) {
        actualizarCantidad(productoExistente.codigo_barras, 1);
        mostrarProductos(buscador ? buscador.value : '');
        alert(`✅ Se añadió 1 unidad. Nueva cantidad: ${productoExistente.cantidad + 1}`);
    }
}

// ============================================
// PROCESAR CÓDIGO ESCANEADO (VERSIÓN MEJORADA)
// ============================================

async function procesarCodigo(codigo) {
    // Primero buscar en Open Food Facts
    const infoProducto = await buscarEnOpenFoodFacts(codigo);
    
    if (infoProducto.encontrado) {
        // Producto encontrado automáticamente
        const productoExistente = await obtenerProducto(codigo);
        
        if (productoExistente) {
            // Ya existe en mi despensa → preguntar si añadir más
            mostrarConfirmacionAñadir(productoExistente, infoProducto);
        } else {
            // Producto nuevo → mostrar formulario PRE-RELLENADO
            mostrarFormularioConDatos(infoProducto);
        }
    } else {
        // No encontrado en Open Food Facts → formulario vacío
        if (infoProducto.error) {
            alert("❌ Error al consultar la base de datos. Rellena los datos manualmente.");
        } else {
            alert("⚠️ Producto no encontrado en la base de datos. Por favor, rellena los datos manualmente.");
        }
        mostrarFormularioProducto(codigo);
    }
}

// ============================================
// UI Y LISTADO DE PRODUCTOS
// ============================================

// Mostrar lista de productos
async function mostrarProductos(filtro = '') {
  const productos = await obtenerTodosProductos();
  const filtrados = productos.filter(p => 
    p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
    p.codigo_barras.includes(filtro)
  );
  
  filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
  
  if (filtrados.length === 0) {
    productList.innerHTML = '<div class="empty-state">📦 No hay productos en la despensa</div>';
    return;
  }
  
  productList.innerHTML = filtrados.map(p => {
    const caducidadClass = p.fecha_caducidad ? 
      (new Date(p.fecha_caducidad) < new Date() ? 'product-caducado' : '') : '';
    const stockClass = p.cantidad <= 2 ? (p.cantidad === 0 ? 'product-critico' : 'product-bajo-stock') : '';
    
    return `
      <div class="product-item ${stockClass}" data-codigo="${p.codigo_barras}">
        <div class="product-info">
          <h4>${p.nombre}</h4>
          <div class="product-codigo">📷 ${p.codigo_barras}</div>
          ${p.fecha_caducidad ? `<div class="product-caducidad">⏰ Cad: ${new Date(p.fecha_caducidad).toLocaleDateString()}</div>` : ''}
          <div class="product-ubicacion">📍 ${p.ubicacion || 'Sin ubicación'}</div>
        </div>
        <div class="product-cantidad">
          <div class="cantidad-number">${p.cantidad}</div>
          <div class="cantidad-unidad">unidades</div>
        </div>
      </div>
    `;
  }).join('');
  
  document.querySelectorAll('.product-item').forEach(el => {
    el.addEventListener('click', async () => {
      const codigo = el.dataset.codigo;
      productoSeleccionado = await obtenerProducto(codigo);
      mostrarAcciones(productoSeleccionado);
    });
  });
  
  actualizarEstadisticas(productos);
}

// Actualizar estadísticas
function actualizarEstadisticas(productos) {
  const total = productos.length;
  const stockBajo = productos.filter(p => p.cantidad > 0 && p.cantidad <= 2).length;
  const porCaducar = productos.filter(p => {
    if (!p.fecha_caducidad) return false;
    const dias = (new Date(p.fecha_caducidad) - new Date()) / (1000 * 60 * 60 * 24);
    return dias > 0 && dias <= 7;
  }).length;
  
  const totalElement = document.getElementById('totalProductos');
  const stockElement = document.getElementById('productosCriticos');
  const caducarElement = document.getElementById('porCaducar');
  
  if (totalElement) totalElement.textContent = total;
  if (stockElement) stockElement.textContent = stockBajo;
  if (caducarElement) caducarElement.textContent = porCaducar;
}

// Mostrar acciones del producto
function mostrarAcciones(producto) {
  const accionesNombre = document.getElementById('accionesProductoNombre');
  if (accionesNombre) accionesNombre.textContent = producto.nombre;
  modalAcciones.style.display = 'flex';
}

// ============================================
// EVENT LISTENERS E INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await mostrarProductos();
  
  // Escáner
  if (btnModoEscaneo) {
    btnModoEscaneo.addEventListener('click', iniciarScanner);
  }
  
  const closeScanner = document.getElementById('closeScanner');
  if (closeScanner) {
    closeScanner.addEventListener('click', () => {
      detenerScanner();
      modalScanner.style.display = 'none';
    });
  }
  
  // Búsqueda
  if (buscador) {
    buscador.addEventListener('input', (e) => {
      mostrarProductos(e.target.value);
    });
  }
  
  // Formulario producto
  const formProducto = document.getElementById('formProducto');
  if (formProducto) {
    formProducto.addEventListener('submit', async (e) => {
      e.preventDefault();
      const producto = {
        codigo_barras: document.getElementById('codigoBarras').value,
        nombre: document.getElementById('nombre').value,
        categoria: document.getElementById('categoria').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        fecha_caducidad: document.getElementById('fechaCaducidad').value || null,
        ubicacion: document.getElementById('ubicacion').value,
        fecha_registro: new Date().toISOString()
      };
      
      await guardarProducto(producto);
      modalProducto.style.display = 'none';
      await mostrarProductos(buscador ? buscador.value : '');
    });
  }
  
  // Acciones
  const btnConsumir = document.getElementById('btnConsumir');
  const btnAgregar = document.getElementById('btnAgregar');
  const btnEditar = document.getElementById('btnEditar');
  const btnEliminar = document.getElementById('btnEliminar');
  const btnCerrarAcciones = document.getElementById('btnCerrarAcciones');
  const btnCancelarProducto = document.getElementById('btnCancelarProducto');
  const btnEscanearManual = document.getElementById('btnEscanearManual');
  const btnConfirmarManual = document.getElementById('btnConfirmarManual');
  const btnCancelarManual = document.getElementById('btnCancelarManual');
  
  if (btnConsumir) {
    btnConsumir.addEventListener('click', async () => {
      await actualizarCantidad(productoSeleccionado.codigo_barras, -1);
      modalAcciones.style.display = 'none';
      await mostrarProductos(buscador ? buscador.value : '');
    });
  }
  
  if (btnAgregar) {
    btnAgregar.addEventListener('click', async () => {
      await actualizarCantidad(productoSeleccionado.codigo_barras, 1);
      modalAcciones.style.display = 'none';
      await mostrarProductos(buscador ? buscador.value : '');
    });
  }
  
  if (btnEditar) {
    btnEditar.addEventListener('click', () => {
      modalAcciones.style.display = 'none';
      document.getElementById('codigoBarras').value = productoSeleccionado.codigo_barras;
      document.getElementById('nombre').value = productoSeleccionado.nombre;
      document.getElementById('categoria').value = productoSeleccionado.categoria;
      document.getElementById('cantidad').value = productoSeleccionado.cantidad;
      document.getElementById('fechaCaducidad').value = productoSeleccionado.fecha_caducidad || '';
      document.getElementById('ubicacion').value = productoSeleccionado.ubicacion || 'Estante 1';
      document.getElementById('modalTitle').textContent = 'Editar producto';
      modalProducto.style.display = 'flex';
    });
  }
  
  if (btnEliminar) {
    btnEliminar.addEventListener('click', async () => {
      if (confirm(`¿Eliminar ${productoSeleccionado.nombre} de la despensa?`)) {
        await eliminarProducto(productoSeleccionado.codigo_barras);
        modalAcciones.style.display = 'none';
        await mostrarProductos(buscador ? buscador.value : '');
      }
    });
  }
  
  if (btnCancelarProducto) {
    btnCancelarProducto.addEventListener('click', () => {
      modalProducto.style.display = 'none';
    });
  }
  
  if (btnCerrarAcciones) {
    btnCerrarAcciones.addEventListener('click', () => {
      modalAcciones.style.display = 'none';
    });
  }
  
  if (btnEscanearManual) {
    btnEscanearManual.addEventListener('click', () => {
      detenerScanner();
      modalScanner.style.display = 'none';
      modalManual.style.display = 'flex';
    });
  }
  
  if (btnConfirmarManual) {
    btnConfirmarManual.addEventListener('click', () => {
      const codigo = document.getElementById('codigoManual').value;
      if (codigo) {
        modalManual.style.display = 'none';
        procesarCodigo(codigo);
      }
    });
  }
  
  if (btnCancelarManual) {
    btnCancelarManual.addEventListener('click', () => {
      modalManual.style.display = 'none';
    });
  }
  
  // Cerrar modales al hacer clic fuera
  window.addEventListener('click', (e) => {
    if (e.target === modalScanner) {
      detenerScanner();
      modalScanner.style.display = 'none';
    }
    if (e.target === modalProducto) modalProducto.style.display = 'none';
    if (e.target === modalManual) modalManual.style.display = 'none';
    if (e.target === modalAcciones) modalAcciones.style.display = 'none';
  });
});
