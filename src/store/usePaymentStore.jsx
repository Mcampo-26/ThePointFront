import axios from 'axios';
import { MERCADOPAGO_API_KEY } from '../../Config/index.js';




export const createDynamicQR = async (req, res) => {
  const { title, price, socketId } = req.body;

  // Verificación de datos
  if (!title || !price || isNaN(price) || !socketId) {
    return res.status(400).json({ message: 'Datos inválidos: título, precio o socketId no válidos' });
  }

  // Datos para la solicitud a la API de POS para generar el QR dinámico
  const qrData = {
    external_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: title,
    fixed_amount: true,
    price: parseFloat(price),
    currency_id: 'ARS',
    category: "general",
  };

  try {
    // Hacer la solicitud a la API de Mercado Pago para generar el QR dinámico
    const response = await axios.post('https://api.mercadopago.com/pos/', qrData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MERCADOPAGO_API_KEY}`,
      }
    });

    const qrCode = response.data.qr_code; // URL de la imagen del QR

    // Guardar el external_id y el socketId en la base de datos
    await Payment.create({
      external_reference: qrData.external_id,
      socketId, // Asociar el socketId al QR
      status: 'pending',
    });

    // Devolver la URL del código QR al frontend
    res.json({ qrCodeURL: qrCode });
  } catch (error) {
    console.error('Error al crear el QR dinámico:', error.response ? error.response.data : error.message);
    res.status(500).json({ message: 'Error al crear el QR dinámico', error: error.message });
  }
};





// Método para y generar el QR con el enlace directo
export const createPaymentLink = async (req, res) => {
  const { title, price,socketId  } = req.body;

  // Verificación de datos
  if (!title || !price || isNaN(price)) {
    return res.status(400).json({ message: 'Datos inválidos: título o precio no válidos' });
  }

  // Datos de la preferencia para Mercado Pago
  const preferenceData = {
    items: [
      {
        title, // Título genérico
        unit_price: parseFloat(price), // Precio total
        quantity: 1, // Una sola compra
        currency_id: 'ARS',
      }
    ],
    payer: {
      email: 'test_user_123456@test.com', // Cambiar por el correo del usuario
    },
    back_urls: {
      success: "https://www.mercadopago.com.ar",
      failure: "https://www.mercadopago.com.ar",
      pending: "https://www.mercadopago.com.ar",
    },
    notification_url: `${process.env.BACKEND_URL}/Pagos/webhook`,
    auto_return: 'approved',
    external_reference: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    expires: true, // Habilitar la expiración
    external_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}` // Expira en 50 segundos // Genera una referencia única para cada transacción
  };

  console.log('URL de éxito:', `${process.env.URL.trim()}/payment-result/success`);

  try {
    // Hacer solicitud a la API de Mercado Pago
    const response = await axios.post('https://api.mercadopago.com/checkout/preferences', preferenceData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MERCADOPAGO_API_KEY}`, // Asegúrate de tener la clave correcta
      }
    });

    const paymentLink = response.data.init_point; // Enlace de pago web

    // Generar deep link para abrir directamente en la app de Mercado Pago
    const deepLink = paymentLink.replace('https://www.mercadopago.com/', 'mercadopago://');

    // Devolver el deep link al frontend
    res.json({ paymentLink: deepLink });
  } catch (error) {
    console.error('Error al crear la preferencia de pago:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      message: 'Error al crear la preferencia de pago', 
      error: error.message,
    });
  }
};





export const savePaymentDetails = async (req, res) => {
  const { userId, amount,  items } = req.body;

  if (!userId) {
    console.error('El ID de usuario es nulo o indefinido.');
    return res.status(400).json({ message: 'ID de usuario es requerido' });
  }

  console.log('Buscando usuario con ID:', userId);

  try {
    const usuario = await Usuario.findById(userId);
    if (!usuario) {
      console.log('Usuario no encontrado para ID:', userId);
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    console.log('Usuario encontrado:', usuario);

    usuario.paymentDetails = {
     
      amount,    

      items,  // Asegúrate de que los ítems se están guardando aquí
    };

    await usuario.save();
    res.status(200).json({ message: 'Detalles de pago guardados exitosamente' });
  } catch (error) {
    console.error('Error al guardar los detalles del pago:', error);
    res.status(500).json({ message: 'Error al guardar los detalles del pago' });
  }
};



export const receiveWebhook = async (req, res) => {
  const io = req.app.locals.io; // Obtener el objeto `io` desde `app.locals`

  if (!io) {
    console.error('Error: io no está definido en el contexto del servidor');
    return res.status(500).json({ message: 'Error: io no está definido' });
  }

  console.log('Webhook recibido:', req.body);

  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      console.log('ID del pago recibido:', paymentId);

      // Obtener detalles del pago desde Mercado Pago
      const paymentDetails = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_API_KEY}`,
        },
      });

      // Verificar si el pago fue aprobado
      if (paymentDetails.data.status === 'approved') {
        console.log('Pago aprobado:', paymentDetails.data);

        // Buscar el QR en la base de datos por external_reference
        const qrRecord = await Qr.findOne({ 'transactions.external_reference': paymentDetails.data.external_reference });

        if (qrRecord) {
          // Actualizar el estado de la transacción en el QR
          const transaction = qrRecord.transactions.find(
            (t) => t.external_reference === paymentDetails.data.external_reference
          );
          if (transaction) {
            transaction.status = 'completed';
            await qrRecord.save();
          }

          const socketId = qrRecord.socketId;

          // Emitir el evento solo al socketId correspondiente
          io.to(socketId).emit('paymentSuccess', {
            status: 'approved',
            paymentId: paymentDetails.data.id,
            amount: paymentDetails.data.transaction_amount, // Puedes enviar más detalles si es necesario
          });
        }
      } else if (paymentDetails.data.status === 'rejected') {
        console.log('Pago rechazado:', paymentDetails.data);

        // Actualizar el estado del pago como rechazado en la base de datos
        const qrRecord = await Qr.findOne({ 'transactions.external_reference': paymentDetails.data.external_reference });

        if (qrRecord) {
          const transaction = qrRecord.transactions.find(
            (t) => t.external_reference === paymentDetails.data.external_reference
          );
          if (transaction) {
            transaction.status = 'failed';
            await qrRecord.save();
          }

          const socketId = qrRecord.socketId;

          // Emitir el evento solo al socketId correspondiente
          io.to(socketId).emit('paymentFailed', {
            status: 'rejected',
            paymentId: paymentDetails.data.id,
          });
        }
      }

      // Responder a Mercado Pago que el webhook fue procesado correctamente
      res.sendStatus(200);
    } else {
      console.log('Tipo de evento desconocido:', type);
      res.sendStatus(200); // Responde 200 incluso si el tipo de evento no es "payment"
    }
  } catch (error) {
    console.error('Error procesando el webhook:', error);
    res.status(500).json({ message: 'Error al procesar el webhook' });
  }
};

