import { useEffect, useRef, useState, type MouseEvent } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button, InlineAlert, TextField } from "./ui";
import { reverseGeocodeCoordinates } from "../lib/geocoding";

export { reverseGeocodeCoordinates } from "../lib/geocoding";

export type LocationValue = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type LocationInputProps = {
  label: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  hint?: string;
  required?: boolean;
};

export function geolocationErrorMessage(error: Pick<GeolocationPositionError, "code">) {
  if (error.code === 1) return "Location permission was denied. Enter the address manually or allow location access in your browser.";
  if (error.code === 2) return "Your location could not be determined. Check your device settings or enter the address manually.";
  if (error.code === 3) return "Location lookup timed out. Try again or enter the address manually.";
  return "Could not read your current location. Enter the address manually.";
}

function MapSelection({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function MapViewport({ latitude, longitude, zoom }: { latitude: number | null; longitude: number | null; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (latitude !== null && longitude !== null) map.setView([latitude, longitude], zoom);
  }, [latitude, longitude, map, zoom]);

  return null;
}

export function LocationInput({ label, value, onChange, hint, required = false }: LocationInputProps) {
  const [locating, setLocating] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectionVersion = useRef(0);
  const geocodeAbort = useRef<AbortController | null>(null);

  async function selectCoordinates(latitude: number, longitude: number) {
    const version = ++selectionVersion.current;
    geocodeAbort.current?.abort();
    const controller = new AbortController();
    geocodeAbort.current = controller;
    setError(null);
    onChange({ ...value, latitude, longitude });
    setResolvingAddress(true);
    setLocating(true);
    try {
      const address = await reverseGeocodeCoordinates(latitude, longitude, controller.signal);
      if (version !== selectionVersion.current) return;
      if (address) onChange({ ...value, address, latitude, longitude });
      else setError("The address could not be resolved. Coordinates were saved; enter the address manually.");
    } catch (reason) {
      if (version !== selectionVersion.current || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setError("The address could not be resolved. Coordinates were saved; enter the address manually.");
    } finally {
      if (version === selectionVersion.current) {
        setLocating(false);
        setResolvingAddress(false);
      }
    }
  }

  function useCurrentLocation(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!navigator.geolocation) {
      setError("This browser does not support location access. Enter the address manually.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void selectCoordinates(position.coords.latitude, position.coords.longitude);
      },
      (reason) => {
        setError(geolocationErrorMessage(reason));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="location-input">
      <div className="location-input-address">
        <TextField
          autoComplete="street-address"
          label={label}
          onChange={(event) => {
            selectionVersion.current += 1;
            geocodeAbort.current?.abort();
            onChange({ ...value, address: event.target.value });
          }}
          required={required}
          value={value.address}
        />
        <Button
          disabled={locating}
          icon={<LocateFixed aria-hidden="true" size={16} />}
          loading={locating}
          onClick={useCurrentLocation}
          type="button"
          variant="outline"
        >
          {locating ? (resolvingAddress ? "Resolving address" : "Finding location") : "Use Current Location"}
        </Button>
        <p className="location-input-hint">{hint ?? "Coordinates are optional and can be selected by clicking the map."}</p>
      </div>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {resolvingAddress && <InlineAlert tone="info">Resolving address for the selected location…</InlineAlert>}
      <div aria-label={`${label} map preview`} className="location-map">
        <MapContainer center={value.latitude !== null && value.longitude !== null ? [value.latitude, value.longitude] : [20, 0]} className="location-map-canvas" scrollWheelZoom={false} zoom={value.latitude === null ? 2 : 17}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapViewport latitude={value.latitude} longitude={value.longitude} zoom={17} />
          <MapSelection onSelect={(latitude, longitude) => { void selectCoordinates(latitude, longitude); }} />
          {value.latitude !== null && value.longitude !== null && <Marker position={[value.latitude, value.longitude]} />}
        </MapContainer>
      </div>
      <p className="location-input-coordinates"><MapPin aria-hidden="true" size={14} /> {value.latitude !== null && value.longitude !== null ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}` : "No point selected yet"}</p>
    </div>
  );
}
