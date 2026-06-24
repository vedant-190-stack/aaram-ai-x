// loader.js
async function detectLocationSilently() {
  try {
    // Attempt to get location with a 4-second timeout
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
    });
    
    sessionStorage.setItem('lat', pos.coords.latitude);
    sessionStorage.setItem('lon', pos.coords.longitude);
    sessionStorage.setItem('geoDetected', 'true');
  } catch (e) {
    sessionStorage.setItem('geoDetected', 'false');
  }
}

// Run this silently in the background
detectLocationSilently();
