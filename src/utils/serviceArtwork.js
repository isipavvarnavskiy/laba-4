import haircutsArtwork from '../assets/services/haircuts.jpg';
import colorArtwork from '../assets/services/color.jpg';
import careArtwork from '../assets/services/care.jpg';
import nailsArtwork from '../assets/services/nails.jpg';

const artworkByService = {
  'women-haircut': haircutsArtwork,
  'men-haircut': haircutsArtwork,
  styling: haircutsArtwork,
  coloring: colorArtwork,
  toning: colorArtwork,
  'hair-care': careArtwork,
  manicure: nailsArtwork,
  'nail-care': nailsArtwork,
};

export function getServiceArtwork(serviceId) {
  return artworkByService[serviceId] || haircutsArtwork;
}
