const EARTH_RADIUS_METERS = 6371000;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(a, b) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}
