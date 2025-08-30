#!/usr/bin/env python3
import os
import sys
import django
import json
import requests

# Add the project root to the Python path
sys.path.append('/mnt/c/Users/aluta/station-tracker/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'station_tracker.settings')
django.setup()

from stations.models import Station

# JR山手線の駅データ（手動で作成）
YAMANOTE_STATIONS = [
    {"name": "東京", "name_kana": "トウキョウ", "lat": 35.6812, "lng": 139.7671},
    {"name": "有楽町", "name_kana": "ユウラクチョウ", "lat": 35.6754, "lng": 139.7634},
    {"name": "新橋", "name_kana": "シンバシ", "lat": 35.6658, "lng": 139.7583},
    {"name": "浜松町", "name_kana": "ハママツチョウ", "lat": 35.6556, "lng": 139.7570},
    {"name": "田町", "name_kana": "タマチ", "lat": 35.6456, "lng": 139.7476},
    {"name": "品川", "name_kana": "シナガワ", "lat": 35.6289, "lng": 139.7390},
    {"name": "大崎", "name_kana": "オオサキ", "lat": 35.6197, "lng": 139.7286},
    {"name": "五反田", "name_kana": "ゴタンダ", "lat": 35.6258, "lng": 139.7238},
    {"name": "目黒", "name_kana": "メグロ", "lat": 35.6332, "lng": 139.7156},
    {"name": "恵比寿", "name_kana": "エビス", "lat": 35.6466, "lng": 139.7100},
    {"name": "渋谷", "name_kana": "シブヤ", "lat": 35.6580, "lng": 139.7016},
    {"name": "原宿", "name_kana": "ハラジュク", "lat": 35.6702, "lng": 139.7026},
    {"name": "代々木", "name_kana": "ヨヨギ", "lat": 35.6832, "lng": 139.7022},
    {"name": "新宿", "name_kana": "シンジュク", "lat": 35.6896, "lng": 139.7006},
    {"name": "新大久保", "name_kana": "シンオオクボ", "lat": 35.7007, "lng": 139.7006},
    {"name": "高田馬場", "name_kana": "タカダノババ", "lat": 35.7122, "lng": 139.7037},
    {"name": "目白", "name_kana": "メジロ", "lat": 35.7211, "lng": 139.7060},
    {"name": "池袋", "name_kana": "イケブクロ", "lat": 35.7295, "lng": 139.7109},
    {"name": "大塚", "name_kana": "オオツカ", "lat": 35.7312, "lng": 139.7288},
    {"name": "巣鴨", "name_kana": "スガモ", "lat": 35.7339, "lng": 139.7394},
    {"name": "駒込", "name_kana": "コマゴメ", "lat": 35.7369, "lng": 139.7467},
    {"name": "田端", "name_kana": "タバタ", "lat": 35.7378, "lng": 139.7607},
    {"name": "西日暮里", "name_kana": "ニシニッポリ", "lat": 35.7321, "lng": 139.7668},
    {"name": "日暮里", "name_kana": "ニッポリ", "lat": 35.7277, "lng": 139.7710},
    {"name": "鶯谷", "name_kana": "ウグイスダニ", "lat": 35.7207, "lng": 139.7782},
    {"name": "上野", "name_kana": "ウエノ", "lat": 35.7139, "lng": 139.7774},
    {"name": "御徒町", "name_kana": "オカチマチ", "lat": 35.7075, "lng": 139.7745},
    {"name": "秋葉原", "name_kana": "アキハバラ", "lat": 35.6984, "lng": 139.7731},
    {"name": "神田", "name_kana": "カンダ", "lat": 35.6919, "lng": 139.7709},
]

def get_osm_polygon(station_name, lat, lng):
    """OSM Overpass APIから駅のポリゴンデータを取得"""
    overpass_url = "http://overpass-api.de/api/interpreter"
    
    # クエリ：駅周辺の建物や鉄道施設を検索
    query = f"""
    [out:json][timeout:25];
    (
      way["railway"="station"]["name"~"{station_name}",i](around:200,{lat},{lng});
      way["building"]["name"~"{station_name}",i](around:200,{lat},{lng});
      way["amenity"="station"]["name"~"{station_name}",i](around:200,{lat},{lng});
    );
    out geom;
    """
    
    try:
        response = requests.post(overpass_url, data=query, timeout=30)
        data = response.json()
        
        if data.get('elements'):
            # 最初に見つかったポリゴンを使用
            for element in data['elements']:
                if element.get('geometry'):
                    coords = [[node['lon'], node['lat']] for node in element['geometry']]
                    if len(coords) >= 3:  # 有効なポリゴンの最小条件
                        return json.dumps({
                            "type": "Polygon",
                            "coordinates": [coords]
                        })
        
        # ポリゴンが見つからない場合、円形の近似ポリゴンを作成（半径100m）
        import math
        radius = 0.001  # 約100m
        points = []
        for i in range(8):  # 8角形
            angle = 2 * math.pi * i / 8
            point_lng = lng + radius * math.cos(angle)
            point_lat = lat + radius * math.sin(angle)
            points.append([point_lng, point_lat])
        points.append(points[0])  # 最初の点で閉じる
        
        return json.dumps({
            "type": "Polygon", 
            "coordinates": [points]
        })
        
    except Exception as e:
        print(f"Error fetching OSM data for {station_name}: {e}")
        # エラーの場合も円形ポリゴンを返す
        import math
        radius = 0.001
        points = []
        for i in range(8):
            angle = 2 * math.pi * i / 8
            point_lng = lng + radius * math.cos(angle)
            point_lat = lat + radius * math.sin(angle)
            points.append([point_lng, point_lat])
        points.append(points[0])
        
        return json.dumps({
            "type": "Polygon",
            "coordinates": [points]
        })

def load_stations():
    """駅データをデータベースに投入"""
    print("Loading JR Yamanote Line stations...")
    
    for station_data in YAMANOTE_STATIONS:
        station, created = Station.objects.get_or_create(
            name=station_data["name"],
            defaults={
                'name_kana': station_data["name_kana"],
                'latitude': station_data["lat"],
                'longitude': station_data["lng"],
                'polygon_data': get_osm_polygon(
                    station_data["name"], 
                    station_data["lat"], 
                    station_data["lng"]
                )
            }
        )
        
        if created:
            print(f"Created: {station.name}")
        else:
            print(f"Already exists: {station.name}")
    
    print(f"Total stations in database: {Station.objects.count()}")

if __name__ == "__main__":
    load_stations()