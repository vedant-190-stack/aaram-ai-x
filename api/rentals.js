import { sql } from '@vercel/postgres';

export default async function handler(request, response) {
  try {
    // 1. Handle GET: Fetch all equipment listings
    if (request.method === 'GET') {
      const rentals = await sql`
        SELECT * FROM equipment_rentals 
        ORDER BY created_at DESC;
      `;
      return response.status(200).json({ success: true, data: rentals.rows });
    }
    
    // 2. Handle POST: Submit a new rental listing
    if (request.method === 'POST') {
      const { owner_name, equipment_type, description, price_per_day, location_city, contact_phone } = request.body;
      
      await sql`
        INSERT INTO equipment_rentals (owner_name, equipment_type, description, price_per_day, location_city, contact_phone)
        VALUES (${owner_name}, ${equipment_type}, ${description}, ${price_per_day}, ${location_city}, ${contact_phone});
      `;
      
      return response.status(201).json({ success: true, message: 'Listing posted successfully!' });
    }
    
  } catch (error) {
    return response.status(500).json({ success: false, error: error.message });
  }
}
