export interface FootprintSummary {
  beam: string;
  shot: string;
  lat: number;
  lon: number;
  rh100_m: number;
  rh50_m: number;
  ground_elevation_m: number;
  highest_return_elevation_m: number;
}

export interface CanopyProfile {
  ground_elevation_m: number;
  highest_return_elevation_m: number;
  sensitivity: number;
  selected_algorithm: number;
  pai: number;
  cover: number;
  fhd_normal: number;
  pai_z: number[];
  pavd_z: number[];
  cover_z: number[];
}

export interface FootprintProfile {
  shot: string;
  beam: string;
  location: { lat: number; lon: number };
  indices: Record<string, number>;
  quality: Record<string, number>;
  provenance: Record<string, string>;
  waveform_dn: number[];
  rh_m: number[];
  canopy: CanopyProfile;
  terrain?: {
    source?: string;
    url?: string;
    elevation_m: number;
    resolution_m?: number;
  };
  imagery?: {
    source?: string;
    url?: string;
    status?: number;
    content_type?: string;
  };
}

export interface ClientIndex {
  pilot: string;
  collection_version: string;
  bbox: [number, number, number, number];
  generated_on?: string;
  joined_high_quality_footprints: number;
  footprints: FootprintSummary[];
  default_shot: string;
  profiles_path: string;
  provenance: {
    source: string;
    collection_version: string;
    join_key: string[];
    products: Record<string, { granule: string; collection: string; earthdata_url: string }>;
  };
}

export interface FireTimelineStop {
  id: string;
  label: string;
  date: string;
  description: string;
}

export interface FireReplayBundle {
  schema_version: string;
  fire: {
    name: string;
    year: number;
    source: string;
    source_url: string;
    disclaimer: string;
  };
  gedi_shot: string;
  perimeter: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  severity_at_point: {
    class: number;
    label: string;
    source: string;
    observation_date: string;
  };
  timeline: FireTimelineStop[];
  pre_fire_canopy: {
    rh100_m: number;
    rh50_m: number;
    cover: number;
    pai: number;
  };
  truth_boundary: string;
}
