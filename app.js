// ============================================
// APP DE DESPENSA COMPARTIDA CON CLOUDFLARE D1
// ============================================

// Variables globales
let despensaActual = null;
let despensasUsuario = [];
let productosActuales = [];
let scannerActivo = false;
let userEmail = null;
let filtroActivo = {
    tipo: 'todos',
    categoria: 'todas',
    ubicacion: 'todas'
};
let notificaciones = {
    stockBajo: [],
    porCaducar: [],
    miembrosNuevos: []
};
let notificacionesLeidas = false;  
let historialMovimientos = [];      
let ultimaVistaNotificaciones = null;

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

// Actualizar nombre de usuario
async function actualizarNombreUsuario(nuevoNombre) {
    try {
        const response = await fetch('/api/usuario/nombre', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre_usuario: nuevoNombre })
        });
        
        if (response.ok) {
            mostrarNotificacion('✅ Nombre actualizado', 'success');
            return true;
        } else {
            throw new Error('Error al actualizar');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error al actualizar nombre', 'error');
        return false;
    }
}

// ============================================
// GESTIÓN DE DESPENSAS
// ============================================

async function cargarDespensas() {
    try {
        despensasUsuario = await apiRequest('despensas');
        
        if (despensasUsuario.length === 0) {
            const opcion = prompt('👋 Bienvenido a la despensa compartida.\n\nNo tienes ninguna despensa todavía.\n\nEscribe "crear" para crear una nueva.\nO escribe "unirse" para unirte a una existente con código de invitación.');
            
            if (opcion === 'crear') {
                const nombre = prompt('📝 Nombre de la nueva despensa:');
                if (nombre && nombre.trim()) {
                    await crearDespensa(nombre.trim());
                } else {
                    cargarDespensas();
                }
            } else if (opcion === 'unirse') {
                const codigo = prompt('🔗 Introduce el código de invitación:');
                if (codigo && codigo.trim()) {
                    await unirseADespensa(codigo.trim().toUpperCase());
                } else {
                    cargarDespensas();
                }
            } else {
                cargarDespensas();
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
    const despensaNombreElement = document.getElementById('despensaActivaNombre');
    if (despensaNombreElement) {
        despensaNombreElement.textContent = despensaActual.nombre;
    }
    
    const tituloElement = document.getElementById('tituloDespensa');
    if (tituloElement) {
        tituloElement.textContent = despensaActual.nombre;
    }
    
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
            await cargarDespensas();
        }
    } catch (error) {
        console.error('Error al unirse:', error);
        alert('❌ Código inválido, expirado o ya usado.\n\nComprueba que el código es correcto y vuelve a intentarlo.');
        const reintentar = confirm('¿Quieres intentar con otro código?');
        if (reintentar) {
            const nuevoCodigo = prompt('🔗 Introduce el código de invitación:');
            if (nuevoCodigo && nuevoCodigo.trim()) {
                unirseADespensa(nuevoCodigo.trim().toUpperCase());
            } else {
                cargarDespensas();
            }
        } else {
            cargarDespensas();
        }
    }
}

async function generarInvitacion() {
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
    const textoBusqueda = buscador ? buscador.value.toLowerCase() : '';
    
    let filtrados = [...productosActuales];
    
    if (filtroActivo.tipo === 'stock-bajo') {
        filtrados = filtrados.filter(p => p.cantidad > 0 && p.cantidad <= 2);
    } else if (filtroActivo.tipo === 'por-caducar') {
        filtrados = filtrados.filter(p => {
            if (!p.fecha_caducidad) return false;
            const dias = (new Date(p.fecha_caducidad) - new Date()) / (1000 * 60 * 60 * 24);
            return dias > 0 && dias <= 7;
        });
    }
    
    if (filtroActivo.categoria !== 'todas') {
        filtrados = filtrados.filter(p => p.categoria === filtroActivo.categoria);
    }
    
    if (filtroActivo.ubicacion !== 'todas') {
        filtrados = filtrados.filter(p => p.ubicacion === filtroActivo.ubicacion);
    }
    
    filtrados = filtrados.filter(p => 
        p.nombre.toLowerCase().includes(textoBusqueda) ||
        p.codigo_barras.includes(textoBusqueda)
    );
    
    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    if (filtrados.length === 0) {
        let mensaje = '📦 No hay productos';
        if (filtroActivo.tipo === 'stock-bajo') mensaje = '📦 No hay productos con stock bajo';
        else if (filtroActivo.tipo === 'por-caducar') mensaje = '📦 No hay productos próximos a caducar';
        productList.innerHTML = `<div class="empty-state">${mensaje}</div>`;
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
    
    document.querySelectorAll('.product-info').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const productItem = el.closest('.product-item');
            const codigo = productItem.dataset.codigo;
            const producto = productosActuales.find(p => p.codigo_barras === codigo);
            if (producto) mostrarAccionesProducto(producto);
        });
    });
    
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
    
    document.querySelectorAll('.btn-increment').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const codigo = btn.dataset.codigo;
            await agregarProductoRapido(codigo);
        });
    });
}

// ============================================
// FUNCIONES DE FILTROS
// ============================================

function aplicarFiltroPorTipo(tipo) {
    filtroActivo.tipo = tipo;
    document.querySelectorAll('.stat-card').forEach(card => {
        card.style.background = '';
        card.classList.remove('filtro-activo');
    });
    
    if (tipo === 'todos') {
        filtroActivo.categoria = 'todas';
        filtroActivo.ubicacion = 'todas';
        if (document.getElementById('filtroCategoria')) {
            document.getElementById('filtroCategoria').value = 'todas';
        }
        if (document.getElementById('filtroUbicacion')) {
            document.getElementById('filtroUbicacion').value = 'todas';
        }
        const primeraTarjeta = document.querySelector('.stat-card:first-child');
        if (primeraTarjeta) {
            primeraTarjeta.style.background = '#e8f0fe';
            primeraTarjeta.classList.add('filtro-activo');
        }
        mostrarNotificacion('Mostrando todos los productos', 'info');
    } else if (tipo === 'stock-bajo') {
        const segundaTarjeta = document.querySelector('.stat-card:nth-child(2)');
        if (segundaTarjeta) {
            segundaTarjeta.style.background = '#fff3e0';
            segundaTarjeta.classList.add('filtro-activo');
        }
        mostrarNotificacion('Mostrando productos con stock bajo', 'info');
    } else if (tipo === 'por-caducar') {
        const terceraTarjeta = document.querySelector('.stat-card:nth-child(3)');
        if (terceraTarjeta) {
            terceraTarjeta.style.background = '#ffebee';
            terceraTarjeta.classList.add('filtro-activo');
        }
        mostrarNotificacion('Mostrando productos próximos a caducar', 'info');
    }
    
    mostrarProductos();
}

function aplicarFiltrosDesdePanel() {
    filtroActivo.categoria = document.getElementById('filtroCategoria').value;
    filtroActivo.ubicacion = document.getElementById('filtroUbicacion').value;
    mostrarProductos();
    mostrarNotificacion('Filtros aplicados', 'success');
}

function limpiarFiltros() {
    filtroActivo = {
        tipo: 'todos',
        categoria: 'todas',
        ubicacion: 'todas'
    };
    if (document.getElementById('filtroCategoria')) {
        document.getElementById('filtroCategoria').value = 'todas';
    }
    if (document.getElementById('filtroUbicacion')) {
        document.getElementById('filtroUbicacion').value = 'todas';
    }
    document.querySelectorAll('.stat-card').forEach(card => {
        card.style.background = '';
        card.classList.remove('filtro-activo');
    });
    const primeraTarjeta = document.querySelector('.stat-card:first-child');
    if (primeraTarjeta) {
        primeraTarjeta.style.background = '#e8f0fe';
        primeraTarjeta.classList.add('filtro-activo');
    }
    if (buscador) buscador.value = '';
    mostrarProductos();
    mostrarNotificacion('Filtros limpiados', 'info');
}

// ============================================
// NOTIFICACIONES
// ============================================

function actualizarNotificaciones(stockAnterior = 0, caducarAnterior = 0) {
    if (!productosActuales) return;
    
    // Calcular notificaciones actuales
    const stockBajoActual = productosActuales.filter(p => p.cantidad > 0 && p.cantidad <= 2);
    
    const hoy = new Date();
    const porCaducarActual = productosActuales.filter(p => {
        if (!p.fecha_caducidad) return false;
        const fechaCad = new Date(p.fecha_caducidad);
        const dias = (fechaCad - hoy) / (1000 * 60 * 60 * 24);
        return dias > 0 && dias <= 7;
    });
    
    // Actualizar variables globales
    notificaciones.stockBajo = stockBajoActual;
    notificaciones.porCaducar = porCaducarActual;
    notificaciones.porCaducar.sort((a, b) => new Date(a.fecha_caducidad) - new Date(b.fecha_caducidad));
    
    // Actualizar badge
    actualizarBadgeNotificaciones(stockAnterior, caducarAnterior);
    
    // Actualizar panel si está abierto
    const modal = document.getElementById('modalNotificaciones');
    if (modal && modal.style.display === 'flex') {
        actualizarPanelNotificaciones();
    }
}

function actualizarBadgeNotificaciones(stockAnterior = null, caducarAnterior = null) {
    const badge = document.getElementById('badgeNotificaciones');
    if (!badge) return;
    
    // Si no se han visto nunca, mostrar el total
    if (!ultimaVistaNotificaciones) {
        const total = notificaciones.stockBajo.length + notificaciones.porCaducar.length;
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
        return;
    }
    
    // Verificar si hay novedades desde la última vista
    let hayNovedades = false;
    
    if (stockAnterior !== null && caducarAnterior !== null) {
        // Si hay nuevos elementos que antes no estaban
        if (notificaciones.stockBajo.length > stockAnterior || 
            notificaciones.porCaducar.length > caducarAnterior) {
            hayNovedades = true;
        }
    } else {
        // Comparación simple
        hayNovedades = (notificaciones.stockBajo.length > 0 || notificaciones.porCaducar.length > 0);
    }
    
    if (hayNovedades) {
        const total = notificaciones.stockBajo.length + notificaciones.porCaducar.length;
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function mostrarPanelNotificaciones() {
    const modal = document.getElementById('modalNotificaciones');
    if (modal) {
        actualizarPanelNotificaciones();
        modal.style.display = 'flex';
        
        // Marcar como vistas (guardar timestamp)
        ultimaVistaNotificaciones = Date.now();
        
        // Ocultar badge
        const badge = document.getElementById('badgeNotificaciones');
        if (badge) badge.style.display = 'none';
    }
}

function cerrarNotificaciones() {
    const modal = document.getElementById('modalNotificaciones');
    if (modal) {
        modal.style.display = 'none';
        // No actualizar el badge aquí, solo se actualiza cuando hay cambios reales
    }
}

function actualizarPanelNotificaciones() {
    const listaStock = document.getElementById('listaStockBajo');
    if (listaStock) {
        if (notificaciones.stockBajo.length === 0) {
            listaStock.innerHTML = '<div class="notificacion-vacia">✅ Sin productos con stock bajo</div>';
        } else {
            listaStock.innerHTML = notificaciones.stockBajo.map(p => `
                <div class="notificacion-item">
                    <span class="icono">⚠️</span>
                    <span class="texto">${escapeHtml(p.nombre)} - quedan ${p.cantidad} ${p.cantidad === 1 ? 'unidad' : 'unidades'}</span>
                </div>
            `).join('');
        }
    }
    
    const listaCaducar = document.getElementById('listaPorCaducar');
    if (listaCaducar) {
        if (notificaciones.porCaducar.length === 0) {
            listaCaducar.innerHTML = '<div class="notificacion-vacia">✅ Sin productos próximos a caducar</div>';
        } else {
            listaCaducar.innerHTML = notificaciones.porCaducar.map(p => {
                const dias = Math.ceil((new Date(p.fecha_caducidad) - new Date()) / (1000 * 60 * 60 * 24));
                let textoDias = '';
                if (dias === 1) textoDias = 'caduca mañana';
                else if (dias === 0) textoDias = 'caduca hoy';
                else textoDias = `caduca en ${dias} días`;
                return `
                    <div class="notificacion-item">
                        <span class="icono">⏰</span>
                        <span class="texto">${escapeHtml(p.nombre)} - ${textoDias}</span>
                    </div>
                `;
            }).join('');
        }
    }
    // Cargar historial 
    cargarHistorialMovimientos();
}

// Cargar historial de movimientos
async function cargarHistorialMovimientos() {
    if (!despensaActual) return;
    
    try {
        const movimientos = await apiRequest(`movimientos?despensa_id=${despensaActual.id}`);
        const listaHistorial = document.getElementById('listaHistorial');
        
        if (listaHistorial) {
            if (movimientos.length === 0) {
                listaHistorial.innerHTML = '<div class="notificacion-vacia">📭 Sin movimientos recientes</div>';
            } else {
                listaHistorial.innerHTML = movimientos.map(m => {
                    let icono = '📝';
                    if (m.tipo === 'consumir') icono = '➖';
                    else if (m.tipo === 'agregar') icono = '➕';
                    else if (m.tipo === 'eliminar') icono = '🗑️';
                    else if (m.tipo === 'crear') icono = '✨';
                    
                    const fecha = new Date(m.fecha).toLocaleString();
                    const cantidadTexto = m.cantidad ? ` ${m.cantidad} ` : ' ';
                    
                    return `
                        <div class="notificacion-item">
                            <span class="icono">${icono}</span>
                            <span class="texto">
                                <strong>${escapeHtml(m.usuario_nombre || m.usuario_email)}</strong> 
                                ${m.tipo === 'consumir' ? 'consumió' : m.tipo === 'agregar' ? 'añadió' : m.tipo === 'eliminar' ? 'eliminó' : 'creó'}
                                ${cantidadTexto}${escapeHtml(m.producto_nombre)}
                            </span>
                            <span class="fecha">${fecha}</span>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
        const listaHistorial = document.getElementById('listaHistorial');
        if (listaHistorial) {
            listaHistorial.innerHTML = '<div class="notificacion-vacia">❌ Error al cargar historial</div>';
        }
    }
}

// ============================================
// FUNCIONES RÁPIDAS
// ============================================

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
        
        // Registrar movimiento 
        await apiRequest('movimientos', 'POST', {
            despensa_id: despensaActual.id,
            tipo: 'consumir',
            producto_nombre: producto.nombre,
            cantidad: 1
        });
        
        producto.cantidad--;
        actualizarCantidadEnUI(codigo, producto.cantidad);
        actualizarEstadisticas();
        mostrarNotificacion(`-1 ${producto.nombre}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al consumir', 'error');
        await cargarProductos();
    }
}

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
        
        // Registrar movimiento 
        await apiRequest('movimientos', 'POST', {
            despensa_id: despensaActual.id,
            tipo: 'agregar',
            producto_nombre: producto.nombre,
            cantidad: 1
        });
        
        producto.cantidad++;
        actualizarCantidadEnUI(codigo, producto.cantidad);
        actualizarEstadisticas();
        mostrarNotificacion(`+1 ${producto.nombre}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al agregar', 'error');
        await cargarProductos();
    }
}

function actualizarCantidadEnUI(codigo, nuevaCantidad) {
    const productItem = document.querySelector(`.product-item[data-codigo="${codigo}"]`);
    if (productItem) {
        const cantidadDiv = productItem.querySelector('.cantidad-number');
        if (cantidadDiv) {
            cantidadDiv.textContent = nuevaCantidad;
        }
        
        const stockClass = nuevaCantidad <= 2 ? (nuevaCantidad === 0 ? 'product-critico' : 'product-bajo-stock') : '';
        productItem.className = `product-item ${stockClass}`;
        
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

// ============================================
// SISTEMA DE NOTIFICACIONES TOAST
// ============================================

let toastTimeout = null;

function mostrarNotificacion(mensaje, tipo = 'info') {
    const toastExistente = document.querySelector('.toast-notification');
    if (toastExistente) {
        toastExistente.remove();
    }
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${tipo}`;
    
    let icono = 'ℹ️';
    if (tipo === 'success') icono = '✅';
    if (tipo === 'error') icono = '❌';
    if (tipo === 'warning') icono = '⚠️';
    
    toast.innerHTML = `${icono} ${mensaje}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
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

    // Guardar valores anteriores para comparar novedades
    const stockAnterior = notificaciones.stockBajo.length;
    const caducarAnterior = notificaciones.porCaducar.length;
    
    actualizarNotificaciones(stockAnterior, caducarAnterior);
}

// ============================================
// ACCIONES DE PRODUCTO
// ============================================

function mostrarAccionesProducto(producto) {
    const accionesNombre = document.getElementById('accionesProductoNombre');
    if (accionesNombre) accionesNombre.textContent = producto.nombre;
    modalAcciones.style.display = 'flex';
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
            
            // Registrar movimiento 
            await apiRequest('movimientos/registrar', 'POST', {
                despensa_id: despensaActual.id,
                tipo: 'eliminar',
                producto_nombre: producto.nombre,
                cantidad: 0
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
    
    const videoElement = document.querySelector('#video');
    if (!videoElement) {
        console.error('❌ No se encontró el elemento #video');
        alert('Error: No se encontró la cámara');
        modalScanner.style.display = 'none';
        return;
    }
    
    if (scannerActivo) {
        Quagga.stop();
        scannerActivo = false;
    }
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        } 
    })
    .then(stream => {
        console.log('✅ Stream de cámara obtenido manualmente');
        videoElement.srcObject = stream;
        videoElement.play();
        
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: videoElement,
                constraints: {
                    facingMode: "environment"
                }
            },
            locator: {
                patchSize: "x-large",
                halfSample: false,
                locate: true
            },
            decoder: {
                readers: ["ean_reader", "ean_8_reader", "code_128_reader"]
            },
            locate: true,
            numOfWorkers: 2,
            frequency: 10
        }, function(err) {
            if (err) {
                console.error('Quagga error:', err);
                alert('Error al iniciar Quagga: ' + (err.message || 'desconocido'));
                return;
            }
            
            console.log('Quagga iniciado correctamente');
            Quagga.start();
            scannerActivo = true;
        });
        
        Quagga.onDetected(function(result) {
            if (result && result.codeResult) {
                const codigo = result.codeResult.code;
                console.log('Código detectado:', codigo);
                
                Quagga.stop();
                scannerActivo = false;
                
                if (videoElement.srcObject) {
                    videoElement.srcObject.getTracks().forEach(track => track.stop());
                    videoElement.srcObject = null;
                }
                
                modalScanner.style.display = 'none';
                procesarCodigo(codigo);
            }
        });
    })
    .catch(err => {
        console.error('❌ Error al acceder a la cámara:', err);
        alert('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
        modalScanner.style.display = 'none';
    });
}

function detenerScanner() {
    if (scannerActivo) {
        Quagga.stop();
        scannerActivo = false;
    }
}

function mostrarCargando(mostrar, mensaje = '🔍 Buscando producto...') {
    let loader = document.getElementById('loadingIndicator');
    if (!loader && mostrar) {
        loader = document.createElement('div');
        loader.id = 'loadingIndicator';
        loader.innerHTML = `<div class="loader">${mensaje}</div>`;
        loader.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:10px; z-index:9999; box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        document.body.appendChild(loader);
    } else if (mostrar && loader) {
        const loaderDiv = loader.querySelector('.loader');
        if (loaderDiv) loaderDiv.innerHTML = mensaje;
    } else if (!mostrar && loader) {
        loader.remove();
    }
}

async function buscarEnMultiplesFuentes(codigo) {
    mostrarCargando(true, 'Buscando en Open Food Facts...');
    const offResult = await buscarEnOpenFoodFacts(codigo);
    if (offResult.encontrado) {
        mostrarCargando(false);
        mostrarNotificacion('✅ Producto encontrado en Open Food Facts', 'success');
        return offResult;
    }
    
    mostrarCargando(true, 'Buscando en Product Open Data...');
    const podResult = await buscarEnProductOpenData(codigo);
    if (podResult.encontrado) {
        mostrarCargando(false);
        mostrarNotificacion('✅ Producto encontrado en Product Open Data', 'success');
        return podResult;
    }
    
    mostrarCargando(false);
    return { encontrado: false, codigo_barras: codigo };
}

async function buscarEnOpenFoodFacts(codigo) {
    try {
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
        console.error('Error en Open Food Facts:', error);
        return { encontrado: false, codigo_barras: codigo, error: true };
    }
}

async function buscarEnProductOpenData(codigo) {
    try {
        const respuesta = await fetch(`https://product-open-data.com/api/v1/product/${codigo}`);
        
        if (respuesta.ok) {
            const datos = await respuesta.json();
            if (datos && datos.name) {
                return {
                    encontrado: true,
                    nombre: datos.name || "Producto sin nombre",
                    marca: datos.brand || "",
                    categoria: datos.category || "Otros",
                    cantidad: datos.quantity || "",
                    imagen: datos.image_url || "",
                    codigo_barras: codigo
                };
            }
        }
        return { encontrado: false, codigo_barras: codigo };
    } catch (error) {
        console.error('Error en Product Open Data:', error);
        return { encontrado: false, codigo_barras: codigo, error: true };
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
    const infoProducto = await buscarEnMultiplesFuentes(codigo);
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
    // Botón de notificaciones
    document.getElementById('btnNotificaciones')?.addEventListener('click', mostrarPanelNotificaciones);
    document.getElementById('closeNotificaciones')?.addEventListener('click', cerrarNotificaciones);
    
    // Eventos de filtros por tipo
    document.querySelectorAll('.stat-card[data-filtro="todos"]')?.forEach(el => {
        el.addEventListener('click', () => aplicarFiltroPorTipo('todos'));
    });
    document.querySelectorAll('.stat-card[data-filtro="stock-bajo"]')?.forEach(el => {
        el.addEventListener('click', () => aplicarFiltroPorTipo('stock-bajo'));
    });
    document.querySelectorAll('.stat-card[data-filtro="por-caducar"]')?.forEach(el => {
        el.addEventListener('click', () => aplicarFiltroPorTipo('por-caducar'));
    });
    
    // Toggle de filtros avanzados
    const btnToggle = document.getElementById('btnToggleFiltros');
    const filtrosBody = document.getElementById('filtrosBody');
    const toggleIcon = document.querySelector('.filtros-toggle-icon');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const isVisible = filtrosBody.style.display === 'block';
            filtrosBody.style.display = isVisible ? 'none' : 'block';
            if (toggleIcon) toggleIcon.classList.toggle('rotated');
        });
    }
    
    // Botones de filtros
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltrosDesdePanel);
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);
    
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
        const nombreElement = document.getElementById('perfilNombre');
        const rolElement = document.getElementById('perfilRol');
        
        if (emailElement) {
            const email = await obtenerUserEmail();
            emailElement.textContent = email || 'No disponible';
        }
        
        if (nombreElement && despensaActual) {
            const nombre = despensaActual.nombre_usuario || 'Sin nombre';
            nombreElement.textContent = nombre;
        }
        
        if (rolElement && despensaActual) {
            rolElement.textContent = despensaActual.rol === 'admin' ? '👑 Administrador' : '👤 Miembro';
        }
        
        const despensaNombreElement = document.getElementById('perfilDespensaNombre');
        const despensaRolElement = document.getElementById('perfilDespensaRol');
        
        if (despensaNombreElement && despensaActual) {
            despensaNombreElement.textContent = despensaActual.nombre;
        }
        
        if (despensaRolElement && despensaActual) {
            despensaRolElement.textContent = despensaActual.rol === 'admin' ? 'Administrador' : 'Miembro';
        }
        
        const seccionMiembros = document.getElementById('seccionMiembros');
        if (seccionMiembros && despensaActual) {
            seccionMiembros.style.display = 'block';
            await cargarMiembrosDespensa();
        }
        
        await cargarCodigoInvitacion();
    }
    
    async function cargarMiembrosDespensa() {
        if (!despensaActual) return;
        
        try {
            const miembros = await apiRequest(`despensas/miembros?despensa_id=${despensaActual.id}`);
            const listaElement = document.getElementById('listaMiembros');
            
            if (listaElement) {
                if (miembros.length === 0) {
                    listaElement.innerHTML = '<p>No hay miembros</p>';
                } else {
                    listaElement.innerHTML = miembros.map(m => `
                        <div class="miembro-item">
                            <span class="miembro-nombre">${escapeHtml(m.nombre)}</span>
                            <span class="miembro-rol ${m.rol}">${m.rol === 'admin' ? 'Admin' : 'Miembro'}</span>
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Error cargando miembros:', error);
            const listaElement = document.getElementById('listaMiembros');
            if (listaElement) {
                listaElement.innerHTML = '<p>Error al cargar miembros</p>';
            }
        }
    }
    
    async function cargarCodigoInvitacion() {
        const codigoElement = document.getElementById('perfilCodigoInvitacion');
        if (!codigoElement || !despensaActual) return;
        codigoElement.textContent = 'No generado';
    }
    
    async function generarCodigoDesdePerfil() {
        if (!despensaActual) {
            mostrarNotificacion('No hay despensa activa', 'error');
            return;
        }
        
        try {
            const resultado = await apiRequest('invitaciones', 'POST', { despensa_id: despensaActual.id });
            const codigoElement = document.getElementById('perfilCodigoInvitacion');
            if (codigoElement) {
                codigoElement.textContent = resultado.codigo;
            }
            mostrarNotificacion(`Código: ${resultado.codigo}`, 'success');
            await navigator.clipboard.writeText(resultado.codigo);
            mostrarNotificacion('📋 Código copiado al portapapeles', 'success');
        } catch (error) {
            console.error('Error generando código:', error);
            mostrarNotificacion('Error al generar código', 'error');
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

    document.getElementById('btnGenerarCodigoPerfil')?.addEventListener('click', generarCodigoDesdePerfil);
    
    document.getElementById('btnEditarNombre')?.addEventListener('click', async () => {
        const nuevoNombre = prompt('Introduce tu nombre de usuario (visible para los miembros de la despensa):', 
            despensaActual?.nombre_usuario || '');
        if (nuevoNombre && nuevoNombre.trim()) {
            await actualizarNombreUsuario(nuevoNombre.trim());
            await cargarDespensas();
            await actualizarPerfil();
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
    
    initTabs();
    actualizarNombreDespensaActiva();
    
    if (btnModoEscaneo) btnModoEscaneo.addEventListener('click', iniciarScanner);
    
    const closeScanner = document.getElementById('closeScanner');
    if (closeScanner) closeScanner.addEventListener('click', () => {
        detenerScanner();
        modalScanner.style.display = 'none';
    });
    
    if (buscador) buscador.addEventListener('input', () => mostrarProductos());
    
    const formProducto = document.getElementById('formProducto');
    if (formProducto) formProducto.addEventListener('submit', guardarProductoFormulario);
    
    document.getElementById('btnConsumir')?.addEventListener('click', consumirProducto);
    document.getElementById('btnAgregar')?.addEventListener('click', agregarProducto);
    document.getElementById('btnEditar')?.addEventListener('click', editarProducto);
    document.getElementById('btnEliminar')?.addEventListener('click', eliminarProducto);
    document.getElementById('btnCerrarAcciones')?.addEventListener('click', () => modalAcciones.style.display = 'none');
    document.getElementById('btnCancelarProducto')?.addEventListener('click', () => modalProducto.style.display = 'none');
    
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
    
    const btnInvitar = document.getElementById('btnInvitar');
    if (btnInvitar) btnInvitar.addEventListener('click', generarInvitacion);

    const btnUnirse = document.getElementById('btnUnirse');
    if (btnUnirse) btnUnirse.addEventListener('click', () => {
        const codigo = prompt('🔗 Introduce el código de invitación:');
        if (codigo && codigo.trim()) {
            unirseADespensa(codigo.trim().toUpperCase());
        }
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === modalScanner) {
            detenerScanner();
            modalScanner.style.display = 'none';
        }
        if (e.target === modalProducto) modalProducto.style.display = 'none';
        if (e.target === modalManual) modalManual.style.display = 'none';
        if (e.target === modalAcciones) modalAcciones.style.display = 'none';
    });
    
    await cargarDespensas();
});
