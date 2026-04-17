// ============================================
// APP DE DESPENSA COMPARTIDA CON CLOUDFLARE D1
// ============================================

// Variables globales
let despensaActual = null;
let despensasUsuario = [];
let productosActuales = [];
let scannerActivo = false;
let userEmail = null;

// Elementos DOM
const modalScanner = document.getElementById('modalScanner');
const modalProducto = document.getElementById('modalProducto');
const modalManual = document.getElementById('modalManual');
const modalAcciones = document.getElementById('modalAcciones');
const modalDespensas = document.getElementById('modalDespensas');
const modalInvitacion = document.getElementById('modalInvitacion');
const productList = document.getElementById('productList');
const buscador = document.getElementById('buscador');
const btnModoEscaneo = document.getElementById('btnModoEscaneo');

// ============================================
// FUNCIONES DE API
// ============================================

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`/api/${endpoint}`, options);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error en la petición');
    }
    return response.json();
}

// Obtener el email del usuario autenticado desde Cloudflare Access
async function obtenerUserEmail() {
    if (userEmail) return userEmail;
    
    try {
        const response = await fetch('/api/user/email');
        if (response.ok) {
            const data = await response.json();
            userEmail = data.email;
            console.log('✅ Email autenticado:', userEmail);
            return userEmail;
        } else {
            throw new Error('No se pudo obtener el email del usuario');
        }
    } catch (error) {
        console.error('❌ Error al obtener el email:', error);
        alert('No se pudo verificar tu sesión. Por favor, recarga la página e inicia sesión de nuevo.');
        window.location.href = '/cdn-cgi/access/logout';
        throw error;
    }
}

// ============================================
// GESTIÓN DE DESPENSAS
// ============================================

async function cargarDespensas() {
    try {
        despensasUsuario = await apiRequest('despensas');
        
        if (despensasUsuario.length === 0) {
            // No tiene ninguna despensa: preguntar si crear o unirse
            const opcion = prompt('👋 Bienvenido a la despensa compartida.\n\nNo tienes ninguna despensa todavía.\n\nEscribe "crear" para crear una nueva.\nO escribe "unirse" para unirte a una existente con código de invitación.');
            
            if (opcion === 'crear') {
                const nombre = prompt('📝 Nombre de la nueva despensa:');
                if (nombre && nombre.trim()) {
                    await crearDespensa(nombre.trim());
                } else {
                    cargarDespensas(); // Reintentar
                }
            } else if (opcion === 'unirse') {
                const codigo = prompt('🔗 Introduce el código de invitación:');
                if (codigo && codigo.trim()) {
                    await unirseADespensa(codigo.trim().toUpperCase());
                } else {
                    cargarDespensas(); // Reintentar
                }
            } else {
                cargarDespensas(); // Reintentar
            }
        } else if (despensasUsuario.length === 1) {
            despensaActual = despensasUsuario[0];
            await cargarProductos();
            mostrarPantallaPrincipal();
        } else {
            mostrarSelectorDespensas();
        }
    } catch (error) {
        console.error('Error cargando despensas:', error);
        alert('Error al cargar las despensas. Recarga la página.');
    }
}

function mostrarPantallaCrearDespensa() {
    const nombre = prompt('Bienvenido a la despensa compartida.\n\nCrea tu primera despensa (ej: "Despensa Familiar"):');
    if (nombre && nombre.trim()) {
        crearDespensa(nombre.trim());
    } else {
        mostrarPantallaCrearDespensa();
    }
}

async function crearDespensa(nombre) {
    try {
        const nuevaDespensa = await apiRequest('despensas', 'POST', { nombre });
        despensaActual = nuevaDespensa;
        despensasUsuario = [nuevaDespensa];
        await cargarProductos();
        
        // Forzar actualización del header
        const despensaNombreElement = document.getElementById('despensaActivaNombre');
        if (despensaNombreElement) {
            despensaNombreElement.textContent = despensaActual.nombre;
        }
        
        mostrarPantallaPrincipal();
    } catch (error) {
        console.error('Error creando despensa:', error);
        alert('Error al crear la despensa. Inténtalo de nuevo.');
        mostrarPantallaCrearDespensa();
    }
}

function mostrarSelectorDespensas() {
    // Crear un mensaje con la lista de despensas
    let mensaje = '📋 TUS DESPENSAS:\n\n';
    despensasUsuario.forEach((d, i) => {
        mensaje += `${i + 1}. ${d.nombre} ${d.rol === 'admin' ? '👑' : '👤'}\n`;
    });
    mensaje += `\nEscribe el NÚMERO de la despensa que quieres usar.`;
    mensaje += `\nO escribe "nueva" para crear una nueva.`;
    mensaje += `\nO escribe "unirse" para unirte a una con código de invitación.`;
    
    const opcion = prompt(mensaje);
    
    if (opcion === 'nueva') {
        const nombre = prompt('📝 Nombre de la nueva despensa:');
        if (nombre && nombre.trim()) {
            crearDespensa(nombre.trim());
        } else {
            mostrarSelectorDespensas();
        }
    } else if (opcion === 'unirse') {
        const codigo = prompt('🔗 Introduce el código de invitación:');
        if (codigo && codigo.trim()) {
            unirseADespensa(codigo.trim().toUpperCase());
        } else {
            mostrarSelectorDespensas();
        }
    } else {
        const indice = parseInt(opcion) - 1;
        if (indice >= 0 && indice < despensasUsuario.length) {
            despensaActual = despensasUsuario[indice];
            cargarProductos();
            mostrarPantallaPrincipal();
        } else {
            alert('❌ Opción no válida.');
            mostrarSelectorDespensas();
        }
    }
}

function mostrarPantallaPrincipal() {
    // Actualizar el nombre de la despensa en el header
    const despensaNombreElement = document.getElementById('despensaActivaNombre');
    if (despensaNombreElement) {
        despensaNombreElement.textContent = despensaActual.nombre;
    }
    
    // También actualizar el título si existe (por compatibilidad)
    const tituloElement = document.getElementById('tituloDespensa');
    if (tituloElement) {
        tituloElement.textContent = despensaActual.nombre;
    }
    
    // Actualizar estadísticas
    actualizarEstadisticas();
}

function mostrarModalUnirse() {
    const codigo = prompt('Introduce el código de invitación de la despensa (6 letras/números):');
    if (codigo && codigo.trim()) {
        unirseADespensa(codigo.trim().toUpperCase());
    }
}

async function unirseADespensa(codigo) {
    try {
        const resultado = await apiRequest('unirse', 'POST', { codigo });
        if (resultado.success) {
            alert(`✅ Te has unido a la despensa correctamente.`);
            // Recargar las despensas del usuario
            await cargarDespensas();
        }
    } catch (error) {
        console.error('Error al unirse:', error);
        alert('❌ Código inválido, expirado o ya usado.\n\nComprueba que el código es correcto y vuelve a intentarlo.');
        // Preguntar si quiere intentar de nuevo o volver al selector
        const reintentar = confirm('¿Quieres intentar con otro código?');
        if (reintentar) {
            const nuevoCodigo = prompt('🔗 Introduce el código de invitación:');
            if (nuevoCodigo && nuevoCodigo.trim()) {
                unirseADespensa(nuevoCodigo.trim().toUpperCase());
            } else {
                cargarDespensas(); // Volver al selector
            }
        } else {
            cargarDespensas();
        }
    }
}

async function generarInvitacion() {
    // Cualquier miembro de la familia puede invitar
    if (!despensaActual || !despensaActual.id) {
        alert('No hay una despensa activa.');
        return;
    }
    
    try {
        const resultado = await apiRequest('invitaciones', 'POST', { despensa_id: despensaActual.id });
        alert(`📨 Código de invitación: ${resultado.codigo}\n\nVálido por 7 días.\nCompártelo con quien quieras que se una a la despensa.`);
    } catch (error) {
        alert('Error generando código de invitación.');
    }
}

// ============================================
// GESTIÓN DE PRODUCTOS
// ============================================

async function cargarProductos() {
    if (!despensaActual) return;
    
    try {
        productosActuales = await apiRequest(`productos?despensa_id=${despensaActual.id}`);
        mostrarProductos();
        actualizarEstadisticas();
    } catch (error) {
        console.error('Error cargando productos:', error);
        productList.innerHTML = '<div class="empty-state">❌ Error cargando productos</div>';
    }
}

function mostrarProductos() {
    const filtro = buscador ? buscador.value.toLowerCase() : '';
    const filtrados = productosActuales.filter(p => 
        p.nombre.toLowerCase().includes(filtro) ||
        p.codigo_barras.includes(filtro)
    );
    
    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    if (filtrados.length === 0) {
        productList.innerHTML = '<div class="empty-state">📦 No hay productos en la despensa</div>';
        return;
    }
    
    productList.innerHTML = filtrados.map(p => {
        const stockClass = p.cantidad <= 2 ? (p.cantidad === 0 ? 'product-critico' : 'product-bajo-stock') : '';
        const cantidad = p.cantidad;
        
        return `
            <div class="product-item ${stockClass}" data-codigo="${p.codigo_barras}">
                <div class="product-info">
                    <h4>${escapeHtml(p.nombre)}</h4>
                    <div class="product-codigo">📷 ${p.codigo_barras}</div>
                    ${p.fecha_caducidad ? `<div class="product-caducidad">⏰ Cad: ${new Date(p.fecha_caducidad).toLocaleDateString()}</div>` : ''}
                    <div class="product-ubicacion">📍 ${p.ubicacion || 'Sin ubicación'}</div>
                </div>
                <div class="product-actions">
                    <button class="btn-decrement" data-codigo="${p.codigo_barras}" ${cantidad === 0 ? 'disabled' : ''}>−</button>
                    <div class="product-cantidad">
                        <div class="cantidad-number">${cantidad}</div>
                        <div class="cantidad-unidad">unidades</div>
                    </div>
                    <button class="btn-increment" data-codigo="${p.codigo_barras}">+</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Evento para el nombre del producto (abrir acciones)
    document.querySelectorAll('.product-info').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const productItem = el.closest('.product-item');
            const codigo = productItem.dataset.codigo;
            const producto = productosActuales.find(p => p.codigo_barras === codigo);
            if (producto) mostrarAccionesProducto(producto);
        });
    });
    
    // Evento para botón restar (-1)
    document.querySelectorAll('.btn-decrement').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const codigo = btn.dataset.codigo;
            const producto = productosActuales.find(p => p.codigo_barras === codigo);
            if (producto && producto.cantidad > 0) {
                await consumirProductoRapido(codigo);
            }
        });
    });
    
    // Evento para botón sumar (+1)
    document.querySelectorAll('.btn-increment').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const codigo = btn.dataset.codigo;
            await agregarProductoRapido(codigo);
        });
    });
}

// Consumir rápido (-1)
async function consumirProductoRapido(codigo) {
    const producto = productosActuales.find(p => p.codigo_barras === codigo);
    if (!producto) return;
    
    if (producto.cantidad <= 0) {
        mostrarNotificacion('No hay suficientes unidades', 'error');
        return;
    }
    
    try {
        await apiRequest('consumir', 'POST', {
            despensa_id: despensaActual.id,
            codigo_barras: codigo
        });
        
        // Actualizar la cantidad localmente para respuesta inmediata
        producto.cantidad--;
        
        // Actualizar la UI
        actualizarCantidadEnUI(codigo, producto.cantidad);
        actualizarEstadisticas();
        
        mostrarNotificacion(`-1 ${producto.nombre}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al consumir', 'error');
        // Recargar para sincronizar
        await cargarProductos();
    }
}

// Agregar rápido (+1)
async function agregarProductoRapido(codigo) {
    const producto = productosActuales.find(p => p.codigo_barras === codigo);
    if (!producto) return;
    
    try {
        await apiRequest('productos', 'POST', {
            despensa_id: despensaActual.id,
            codigo_barras: producto.codigo_barras,
            nombre: producto.nombre,
            categoria: producto.categoria,
            cantidad: producto.cantidad + 1,
            fecha_caducidad: producto.fecha_caducidad,
            ubicacion: producto.ubicacion
        });
        
        // Actualizar la cantidad localmente para respuesta inmediata
        producto.cantidad++;
        
        // Actualizar la UI
        actualizarCantidadEnUI(codigo, producto.cantidad);
        actualizarEstadisticas();
        
        mostrarNotificacion(`+1 ${producto.nombre}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al agregar', 'error');
        // Recargar para sincronizar
        await cargarProductos();
    }
}

// Actualizar la cantidad en la UI sin recargar toda la lista
function actualizarCantidadEnUI(codigo, nuevaCantidad) {
    const productItem = document.querySelector(`.product-item[data-codigo="${codigo}"]`);
    if (productItem) {
        const cantidadDiv = productItem.querySelector('.cantidad-number');
        if (cantidadDiv) {
            cantidadDiv.textContent = nuevaCantidad;
        }
        
        // Actualizar clase de stock
        const stockClass = nuevaCantidad <= 2 ? (nuevaCantidad === 0 ? 'product-critico' : 'product-bajo-stock') : '';
        productItem.className = `product-item ${stockClass}`;
        
        // Habilitar/deshabilitar botón restar
        const decrementBtn = productItem.querySelector('.btn-decrement');
        if (decrementBtn) {
            if (nuevaCantidad === 0) {
                decrementBtn.setAttribute('disabled', 'disabled');
            } else {
                decrementBtn.removeAttribute('disabled');
            }
        }
    }
}

// Sistema de notificaciones toast
let toastTimeout = null;

function mostrarNotificacion(mensaje, tipo = 'info') {
    // Eliminar toast existente
    const toastExistente = document.querySelector('.toast-notification');
    if (toastExistente) {
        toastExistente.remove();
    }
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    // Crear nuevo toast
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${tipo}`;
    
    let icono = 'ℹ️';
    if (tipo === 'success') icono = '✅';
    if (tipo === 'error') icono = '❌';
    if (tipo === 'warning') icono = '⚠️';
    
    toast.innerHTML = `${icono} ${mensaje}`;
    document.body.appendChild(toast);
    
    // Mostrar con animación
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Ocultar después de 2 segundos
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 2000);
}

function actualizarEstadisticas() {
    if (!productosActuales) return;
    
    const total = productosActuales.length;
    const stockBajo = productosActuales.filter(p => p.cantidad > 0 && p.cantidad <= 2).length;
    const porCaducar = productosActuales.filter(p => {
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

function mostrarAccionesProducto(producto) {
    const accionesNombre = document.getElementById('accionesProductoNombre');
    if (accionesNombre) accionesNombre.textContent = producto.nombre;
    modalAcciones.style.display = 'flex';
    
    // Guardar producto seleccionado para las acciones
    window.productoSeleccionado = producto;
}

async function consumirProducto() {
    const producto = window.productoSeleccionado;
    if (!producto) return;
    
    if (producto.cantidad <= 0) {
        alert('No hay suficientes unidades para consumir.');
        return;
    }
    
    try {
        await apiRequest('consumir', 'POST', {
            despensa_id: despensaActual.id,
            codigo_barras: producto.codigo_barras
        });
        await cargarProductos();
        modalAcciones.style.display = 'none';
    } catch (error) {
        alert('Error al consumir el producto.');
    }
}

async function agregarProducto() {
    const producto = window.productoSeleccionado;
    if (!producto) return;
    
    try {
        await apiRequest('productos', 'POST', {
            despensa_id: despensaActual.id,
            codigo_barras: producto.codigo_barras,
            nombre: producto.nombre,
            categoria: producto.categoria,
            cantidad: producto.cantidad + 1,
            fecha_caducidad: producto.fecha_caducidad,
            ubicacion: producto.ubicacion
        });
        await cargarProductos();
        modalAcciones.style.display = 'none';
    } catch (error) {
        alert('Error al agregar el producto.');
    }
}

async function eliminarProducto() {
    const producto = window.productoSeleccionado;
    if (!producto) return;
    
    if (confirm(`¿Eliminar ${producto.nombre} de la despensa?`)) {
        try {
            await apiRequest('productos', 'DELETE', {
                despensa_id: despensaActual.id,
                codigo_barras: producto.codigo_barras
            });
            await cargarProductos();
            modalAcciones.style.display = 'none';
        } catch (error) {
            alert('Error al eliminar el producto.');
        }
    }
}

function editarProducto() {
    const producto = window.productoSeleccionado;
    if (!producto) return;
    
    document.getElementById('codigoBarras').value = producto.codigo_barras;
    document.getElementById('nombre').value = producto.nombre;
    document.getElementById('categoria').value = producto.categoria || 'Alimentos';
    document.getElementById('cantidad').value = producto.cantidad;
    document.getElementById('fechaCaducidad').value = producto.fecha_caducidad || '';
    document.getElementById('ubicacion').value = producto.ubicacion || 'Estante 1';
    document.getElementById('modalTitle').textContent = 'Editar producto';
    
    modalAcciones.style.display = 'none';
    modalProducto.style.display = 'flex';
}

// ============================================
// ESCÁNER Y BÚSQUEDA AUTOMÁTICA
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
            readers: ["ean_reader", "ean_8_reader", "code_128_reader", "code_39_reader", "upc_reader", "upc_e_reader"]
        }
    }, (err) => {
        if (err) {
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

function mostrarCargando(mostrar) {
    let loader = document.getElementById('loadingIndicator');
    if (!loader && mostrar) {
        loader = document.createElement('div');
        loader.id = 'loadingIndicator';
        loader.innerHTML = '<div class="loader">🔍 Buscando producto...</div>';
        loader.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:10px; z-index:9999; box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        document.body.appendChild(loader);
    } else if (!mostrar && loader) {
        loader.remove();
    }
}

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
                codigo_barras: codigo
            };
        }
        return { encontrado: false, codigo_barras: codigo };
    } catch (error) {
        return { encontrado: false, codigo_barras: codigo, error: true };
    } finally {
        mostrarCargando(false);
    }
}

function extraerCategoria(tags) {
    if (!tags || tags.length === 0) return "Otros";
    const mapa = {
        "en:beverages": "Bebidas", "en:dairy": "Lácteos", "en:fruits": "Frutas",
        "en:vegetables": "Verduras", "en:meats": "Carnes", "en:frozen-foods": "Congelados",
        "en:snacks": "Snacks", "en:canned-foods": "Conservas"
    };
    for (const tag of tags) {
        if (mapa[tag]) return mapa[tag];
    }
    return "Alimentos";
}

async function procesarCodigo(codigo) {
    // Buscar en Open Food Facts
    const infoProducto = await buscarEnOpenFoodFacts(codigo);
    
    // Verificar si ya existe en la despensa
    const productoExistente = productosActuales.find(p => p.codigo_barras === codigo);
    
    if (productoExistente) {
        const confirmar = confirm(`"${productoExistente.nombre}" ya existe.\nCantidad actual: ${productoExistente.cantidad}\n¿Añadir 1 unidad?`);
        if (confirmar) {
            await apiRequest('productos', 'POST', {
                despensa_id: despensaActual.id,
                codigo_barras: productoExistente.codigo_barras,
                nombre: productoExistente.nombre,
                categoria: productoExistente.categoria,
                cantidad: productoExistente.cantidad + 1,
                fecha_caducidad: productoExistente.fecha_caducidad,
                ubicacion: productoExistente.ubicacion
            });
            await cargarProductos();
        }
        return;
    }
    
    // Producto nuevo
    if (infoProducto.encontrado) {
        document.getElementById('codigoBarras').value = infoProducto.codigo_barras;
        document.getElementById('nombre').value = infoProducto.nombre;
        document.getElementById('categoria').value = infoProducto.categoria;
        document.getElementById('cantidad').value = "1";
        document.getElementById('fechaCaducidad').value = "";
        document.getElementById('modalTitle').textContent = '✨ Producto detectado automáticamente';
    } else {
        document.getElementById('codigoBarras').value = codigo;
        document.getElementById('nombre').value = '';
        document.getElementById('categoria').value = 'Alimentos';
        document.getElementById('cantidad').value = "1";
        document.getElementById('fechaCaducidad').value = "";
        document.getElementById('modalTitle').textContent = 'Nuevo producto';
    }
    
    modalProducto.style.display = 'flex';
}

async function guardarProductoFormulario(event) {
    event.preventDefault();
    
    const producto = {
        despensa_id: despensaActual.id,
        codigo_barras: document.getElementById('codigoBarras').value,
        nombre: document.getElementById('nombre').value,
        categoria: document.getElementById('categoria').value,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        fecha_caducidad: document.getElementById('fechaCaducidad').value || null,
        ubicacion: document.getElementById('ubicacion').value
    };
    
    try {
        await apiRequest('productos', 'POST', producto);
        modalProducto.style.display = 'none';
        await cargarProductos();
    } catch (error) {
        alert('Error al guardar el producto.');
    }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EVENTOS E INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // ============================================
    // SISTEMA DE PESTAÑAS
    // ============================================
    
    function initTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                contents.forEach(content => content.classList.remove('active'));
                document.getElementById(`tab-${tabId}`).classList.add('active');
                
                if (tabId === 'despensas') {
                    cargarListaDespensas();
                }
                
                if (tabId === 'perfil') {
                    actualizarPerfil();
                }
            });
        });
    }
    
    async function cargarListaDespensas() {
        const contenedor = document.getElementById('listaDespensas');
        if (!contenedor) return;
        
        try {
            const despensas = await apiRequest('despensas');
            
            if (despensas.length === 0) {
                contenedor.innerHTML = '<div class="empty-state">📦 No tienes despensas. Crea una o únete con código.</div>';
                return;
            }
            
            contenedor.innerHTML = despensas.map(d => `
                <div class="despensa-card ${despensaActual && despensaActual.id === d.id ? 'active' : ''}" data-id="${d.id}">
                    <div class="despensa-info">
                        <h4>${escapeHtml(d.nombre)}</h4>
                        <span class="despensa-rol ${d.rol}">${d.rol === 'admin' ? '👑 Administrador' : '👤 Miembro'}</span>
                    </div>
                    <div class="despensa-badge">
                        ${despensaActual && despensaActual.id === d.id ? '✅' : '➡️'}
                    </div>
                </div>
            `).join('');
            
            document.querySelectorAll('.despensa-card').forEach(card => {
                card.addEventListener('click', async () => {
                    const id = card.dataset.id;
                    const despensa = despensas.find(d => d.id === id);
                    if (despensa) {
                        despensaActual = despensa;
                        document.getElementById('despensaActivaNombre').textContent = despensa.nombre;
                        await cargarProductos();
                        document.querySelector('.tab-btn[data-tab="productos"]').click();
                        mostrarNotificacion(`Despensa: ${despensa.nombre}`, 'success');
                    }
                });
            });
        } catch (error) {
            console.error('Error cargando despensas:', error);
            contenedor.innerHTML = '<div class="empty-state">❌ Error al cargar despensas</div>';
        }
    }
    
    async function actualizarPerfil() {
        const emailElement = document.getElementById('perfilEmail');
        const rolElement = document.getElementById('perfilRol');
        
        if (emailElement) {
            const email = await obtenerUserEmail();
            emailElement.textContent = email || 'No disponible';
        }
        
        if (rolElement && despensaActual) {
            rolElement.textContent = despensaActual.rol === 'admin' ? '👑 Administrador de esta despensa' : '👤 Miembro de esta despensa';
        }
    }
    
    // Botones de despensas
    document.getElementById('btnCrearDespensa')?.addEventListener('click', () => {
        const nombre = prompt('📝 Nombre de la nueva despensa:');
        if (nombre && nombre.trim()) {
            crearDespensa(nombre.trim());
        }
    });
    
    document.getElementById('btnUnirseDespensa')?.addEventListener('click', () => {
        const codigo = prompt('🔗 Introduce el código de invitación:');
        if (codigo && codigo.trim()) {
            unirseADespensa(codigo.trim().toUpperCase());
        }
    });
    
    document.getElementById('btnExportarDatos')?.addEventListener('click', () => {
        exportarDatos();
    });
    
    document.getElementById('btnCerrarSesion')?.addEventListener('click', () => {
        if (confirm('¿Cerrar sesión? Deberás autenticarte de nuevo.')) {
            window.location.href = '/cdn-cgi/access/logout';
        }
    });
    
    document.getElementById('btnEliminarCuenta')?.addEventListener('click', () => {
        if (confirm('⚠️ ELIMINAR CUENTA\n\nEsta acción es irreversible. Se borrarán todos tus datos.\n¿Estás segura?')) {
            if (confirm('Última confirmación: ¿Realmente quieres eliminar tu cuenta?')) {
                mostrarNotificacion('Función en desarrollo', 'warning');
            }
        }
    });
    
    async function exportarDatos() {
        try {
            const productos = await apiRequest(`productos?despensa_id=${despensaActual.id}`);
            const dataStr = JSON.stringify(productos, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `despensa_${despensaActual.nombre}_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            mostrarNotificacion('📤 Datos exportados', 'success');
        } catch (error) {
            mostrarNotificacion('Error al exportar', 'error');
        }
    }
    
    function actualizarNombreDespensaActiva() {
        const span = document.getElementById('despensaActivaNombre');
        if (span && despensaActual) {
            span.textContent = despensaActual.nombre;
        }
    }
    
    // Inicializar pestañas
    initTabs();
    actualizarNombreDespensaActiva();
    
    // Configurar eventos
    if (btnModoEscaneo) btnModoEscaneo.addEventListener('click', iniciarScanner);
    
    const closeScanner = document.getElementById('closeScanner');
    if (closeScanner) closeScanner.addEventListener('click', () => {
        detenerScanner();
        modalScanner.style.display = 'none';
    });
    
    if (buscador) buscador.addEventListener('input', () => mostrarProductos());
    
    const formProducto = document.getElementById('formProducto');
    if (formProducto) formProducto.addEventListener('submit', guardarProductoFormulario);
    
    // Botones de acciones
    document.getElementById('btnConsumir')?.addEventListener('click', consumirProducto);
    document.getElementById('btnAgregar')?.addEventListener('click', agregarProducto);
    document.getElementById('btnEditar')?.addEventListener('click', editarProducto);
    document.getElementById('btnEliminar')?.addEventListener('click', eliminarProducto);
    document.getElementById('btnCerrarAcciones')?.addEventListener('click', () => modalAcciones.style.display = 'none');
    document.getElementById('btnCancelarProducto')?.addEventListener('click', () => modalProducto.style.display = 'none');
    
    // Escaneo manual
    document.getElementById('btnEscanearManual')?.addEventListener('click', () => {
        detenerScanner();
        modalScanner.style.display = 'none';
        modalManual.style.display = 'flex';
    });
    
    document.getElementById('btnConfirmarManual')?.addEventListener('click', () => {
        const codigo = document.getElementById('codigoManual').value;
        if (codigo) {
            modalManual.style.display = 'none';
            procesarCodigo(codigo);
        }
    });
    
    document.getElementById('btnCancelarManual')?.addEventListener('click', () => modalManual.style.display = 'none');
    
    // Botón invitar
    const btnInvitar = document.getElementById('btnInvitar');
    if (btnInvitar) btnInvitar.addEventListener('click', generarInvitacion);

    // Botón unirse
    const btnUnirse = document.getElementById('btnUnirse');
    if (btnUnirse) btnUnirse.addEventListener('click', () => {
        const codigo = prompt('🔗 Introduce el código de invitación:');
        if (codigo && codigo.trim()) {
            unirseADespensa(codigo.trim().toUpperCase());
        }
    });
    
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
    
    // Inicializar
    await cargarDespensas();
});
