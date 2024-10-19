import { create } from 'zustand';
import axios from 'axios';
import { URL } from '../utilities/config.js';

export const usePaymentStore = create((set) => ({
  // Estado de pagos
  paymentLoading: false,
  paymentError: null,
  paymentLink: null,
  qrCodeURL: null, 
  modoQRCodeURL: null,
  modoDeeplink: null,
  
  products: JSON.parse(localStorage.getItem('selectedProducts')) || [
    { id: 1, name: 'Cerveza', price: 200, quantity: 0 },
    { id: 2, name: 'Fernet', price: 300, quantity: 0 },
    { id: 3, name: 'Gin', price: 400, quantity: 0 },
    { id: 4, name: 'Vodka', price: 500, quantity: 0 },
  ],

  // Acción para crear QR dinámico de Mercado Pago
  createPaymentLink: async (productName, price) => {
    set({ paymentLoading: true, paymentError: null });
    try {
      const response = await axios.post(`${URL}/Pagos/create_payment_link`, {
        title: productName,
        price: parseFloat(price),
      });

      const paymentLink = response.data.paymentLink;
      if (paymentLink) {
        set({ paymentLoading: false, paymentLink });
        return paymentLink;
      } else {
        throw new Error('No se recibió un enlace de pago en la respuesta');
      }
    } catch (error) {
      set({
        paymentError: 'Hubo un problema al generar tu enlace de pago.',
        paymentLoading: false,
      });
      throw error;
    }
  },

  // Acción para crear checkout de MODO
  createModoCheckout: async (price, details) => {
  set({ paymentLoading: true, paymentError: null });
  try {
    const response = await axios.post(`${URL}/Pagos/create_modo`, {
      price: parseFloat(price),
      details: details,
    });

    // Desestructura la respuesta
    const { qr, deeplink } = response.data;

    // Agrega el console.log para verificar la respuesta
    console.log("Respuesta de MODO:", response.data); // Asegúrate de que esto muestra correctamente los datos
    console.log("QR recibido en el frontend:", qr);

    // Guarda los datos en el estado de Zustand
    set({
      paymentLoading: false,
      modoQRCodeURL: qr, // El código QR en formato de cadena
      modoDeeplink: deeplink, // El deep link
    });

    return { qr, deeplink };
  } catch (error) {
    set({
      paymentError: 'Hubo un problema al crear el checkout de MODO.',
      paymentLoading: false,
    });
    throw error;
  }
},

  // Guardar detalles de pago



  // Manejar webhook de MODO

}));

export default usePaymentStore;