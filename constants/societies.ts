/**
 * SOCIETY DIRECTORY — the tower / floor / flat picker behind the launch-area
 * address flow.
 *
 * WHY THIS EXISTS: riders deliver a whole tower floor in one lift ride, so the
 * address a member types has to be MACHINE-GROUPABLE ("P4 · 8th · 805"), not a
 * free-text line a human has to interpret at 5 AM. Inside the launch township
 * the address form therefore collects Society → Tower → Floor → Flat from this
 * directory instead of a "Flat / House No" text box, and the saved address
 * carries the structured parts (see lib/societyAddress.ts) so the operator and
 * rider apps can bucket orders by tower+floor.
 *
 * PROVENANCE: generated from chandra_panorama_MASTER_v2 (the society's own unit
 * directory). Non-residential rows (shops, commercial spaces, utility rooms)
 * are excluded; flats, merged flats (one door, two numbers), villas and servant
 * rooms are included, with the floor derived from the unit number when the
 * source row left it blank.
 *
 * NOT AUTHORITATIVE: the directory has known gaps (units hidden from the
 * society's own picker, a tower whose upper floors were inferred). Every
 * surface that uses it MUST therefore offer a "my flat is not listed" escape
 * to the plain typed address — a member must never be locked out of ordering
 * by a missing row. Regenerate by re-running the CSV import when the society
 * publishes an update; the shape below is the only contract.
 */

export type SocietyFloor = { floor: number; units: string[] };
export type SocietyTower = { id: string; label: string; floors: SocietyFloor[] };
export type Society = {
  id: string;
  /** Shown in the Society dropdown. */
  name: string;
  city: string;
  /** The NATIVE location line the app shows instead of the city ("Deliver to …"). */
  area: string;
  pincode: string;
  /** Map centre. Optional: a society without one is never auto-picked from a pin. */
  coords?: { lat: number; lng: number };
  /** Radius that counts as "inside this society" for the address prompt. */
  radiusKm: number;
  towers: SocietyTower[];
};

/**
 * The launch township. Any delivery point inside this circle gets the native
 * area label and the structured society address flow. Env-overridable so the
 * zone can move or grow without a release.
 */
export const LAUNCH_AREA = {
  city: 'Lucknow',
  area: process.env.EXPO_PUBLIC_LAUNCH_AREA_LABEL || 'Sushant Golf City',
  pincode: process.env.EXPO_PUBLIC_LAUNCH_AREA_PINCODE || '226030',
  lat: Number(process.env.EXPO_PUBLIC_SERVICE_AREA_LAT) || 26.7715,
  lng: Number(process.env.EXPO_PUBLIC_SERVICE_AREA_LNG) || 81.0176,
  radiusKm: Number(process.env.EXPO_PUBLIC_SERVICE_RADIUS_KM) || 6,
};

export const SOCIETIES: Society[] = [
  {
    id: 'chandra-panorama',
    name: 'Chandra Panorama',
    city: LAUNCH_AREA.city,
    area: LAUNCH_AREA.area,
    pincode: LAUNCH_AREA.pincode,
    coords: { lat: 26.7738, lng: 81.0089 },
    radiusKm: 1,
    towers: [
    {
      id: 'P1',
      label: 'Tower P1',
      floors: [
      { floor: 0, units: ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', 'CASA-Villa-03', 'Casa-Villa-04', 'Casa-Villa-07'] },
      { floor: 1, units: ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111'] },
      { floor: 2, units: ['201', '202', '203', '204', '205', '206', '206S', '207', '208', '209', '210', '211'] },
      { floor: 3, units: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310-311'] },
      { floor: 4, units: ['401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '411'] },
      { floor: 5, units: ['501', '502', '503', '504', '505', '506', '507', '508', '509', '510', '511'] },
      { floor: 6, units: ['601', '602', '603', '604', '605', '606', '607', '608', '609', '610-611'] },
      { floor: 7, units: ['701', '702', '703', '704', '705', '706', '707', '708', '709', '710-711'] },
      { floor: 8, units: ['801', '802', '803', '803-SR', '804', '805', '806', '807', '808', '809', '810-811'] },
      { floor: 9, units: ['901', '902', '903', '904', '905', '906', '907', '908', '909', '910-911'] },
      { floor: 10, units: ['1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008', '1009', '1010-1011'] },
      { floor: 11, units: ['1101', '1102', '1103', '1103-SR', '1104', '1105', '1106', '1107', '1108', '1109', '1110-1111'] },
      { floor: 12, units: ['1201', '1202', '1203', '1204', '1205', '1206', '1207', '1208', '1209', '1210-1211'] },
      { floor: 13, units: ['1301', '1302', '1303', '1304', '1305', '1306', '1306-S', '1307', '1308', '1309', '1310-1311'] },
      { floor: 14, units: ['1401', '1402', '1403', '1403-SR', '1404', '1405', '1406', '1407', '1408', '1409', '1410-1411'] },
      ],
    },
    {
      id: 'P2',
      label: 'Tower P2',
      floors: [
      { floor: 0, units: ['005', '006', '007', '011', '012', '013', '014', '015', '016'] },
      { floor: 1, units: ['101', '101-S', '102', '103', '104', '105', '106', '107', '108', '108-S', '109', '110', '111', '112', '112-SR', '113', '114', '115', '116'] },
      { floor: 2, units: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '214-SR', '215', '216'] },
      { floor: 3, units: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '315', '316'] },
      { floor: 4, units: ['401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '411', '412', '413', '414', '415', '416'] },
      { floor: 5, units: ['501', '502', '503', '504', '505', '506', '507', '508', '509', '510', '511', '512', '513', '514', '515', '516'] },
      { floor: 6, units: ['601', '602', '603', '604', '605', '605-SR', '606', '607', '608', '609', '610', '611', '612', '613', '614', '615', '616'] },
      { floor: 7, units: ['701', '702', '703', '703-S', '704', '705', '706', '707', '708', '709', '710', '711', '712', '713', '714', '715', '716'] },
      { floor: 8, units: ['801', '802', '803', '804', '805', '806', '807', '808', '809', '810', '810-SR', '811', '812', '813', '814', '814 S', '815', '816', '816-SR'] },
      { floor: 9, units: ['901', '902', '903', '904', '905', '906', '907', '908', '909', '910', '911', '912', '912-S', '913', '914', '915', '916'] },
      { floor: 10, units: ['1001', '1002', '1003', '1004', '1005', '1006', '1007', '1007-SR', '1008', '1009', '1010', '1010(S)', '1011', '1012', '1013', '1014', '1015', '1016'] },
      { floor: 11, units: ['1101', '1101-S', '1102', '1103', '1104', '1105', '1106', '1107', '1108', '1109', '1110', '1111', '1112', '1113', '1114', '1115', '1116'] },
      { floor: 12, units: ['1201', '1202', '1203', '1204', '1205', '1206', '1207', '1208', '1208-SR', '1209', '1210', '1211', '1212', '1213', '1214', '1215', '1216'] },
      { floor: 13, units: ['1301', '1302', '1303', '1304', '1305', '1306', '1307', '1308', '1309', '1310', '1310-SR', '1311', '1312', '1313', '1314', '1315', '1316'] },
      { floor: 14, units: ['1401', '1402', '1403', '1404', '1405', '1406', '1407', '1408', '1409', '1410', '1411', '1412', '1413', '1414', '1415', '1416'] },
      { floor: 15, units: ['1501', '1502', '1503', '1504', '1505', '1506', '1507', '1507- SR', '1507-SR', '1508', '1509', '1510', '1511', '1512', '1513', '1514', '1515', '1516'] },
      { floor: 16, units: ['1601', '1602', '1603', '1604', '1605', '1606', '1607', '1608', '1609', '1610', '1611', '1612', '1613', '1614', '1615', '1616'] },
      { floor: 17, units: ['1701', '1701-SR', '1702', '1703', '1704', '1705', '1706', '1707', '1707-S', '1708', '1709', '1710', '1711', '1712', '1713', '1714', '1715', '1715-S', '1716'] },
      { floor: 18, units: ['1801', '1802', '1803', '1804', '1805', '1806', '1807', '1808', '1809', '1810', '1811', '1812', '1813', '1814', '1815', '1816'] },
      ],
    },
    {
      id: 'P3',
      label: 'Tower P3',
      floors: [
      { floor: 1, units: ['101', '101S', '102', '103', '104', '104-SR', '105', '106'] },
      { floor: 2, units: ['201', '201-S', '201-SR', '202', '203', '204', '205', '206'] },
      { floor: 3, units: ['301', '302', '303', '304', '304-S', '304-SR', '305', '306'] },
      { floor: 4, units: ['401', '402', '403', '404', '405', '406', '406S'] },
      { floor: 5, units: ['501', '502', '503', '504', '505', '506'] },
      { floor: 6, units: ['601', '602', '603', '604', '605', '605-S', '606'] },
      { floor: 7, units: ['701', '702', '703', '703-SR', '704', '705', '706'] },
      { floor: 8, units: ['801', '802', '803', '804', '804-SR', '805', '806'] },
      { floor: 9, units: ['901', '902', '903', '903-SR', '904', '905', '906'] },
      { floor: 10, units: ['1001', '1002', '1003', '1004', '1005', '1006'] },
      { floor: 11, units: ['1101', '1102', '1103', '1104', '1105', '1106'] },
      { floor: 12, units: ['1201', '1202', '1203', '1204', '1205', '1206'] },
      { floor: 13, units: ['1301', '1302', '1303', '1303-SR', '1304', '1305', '1306'] },
      { floor: 14, units: ['1401', '1402', '1403', '1403-SR', '1404', '1405', '1406'] },
      { floor: 15, units: ['1501', '1502', '1502-SR', '1503', '1504', '1505', '1506'] },
      { floor: 16, units: ['1601', '1602', '1603', '1604', '1605', '1606'] },
      { floor: 17, units: ['1701', '1702', '1703', '1704', '1704-SR', '1705', '1706'] },
      { floor: 18, units: ['1801', '1802', '1803', '1804', '1805', '1806'] },
      ],
    },
    {
      id: 'P4',
      label: 'Tower P4',
      floors: [
      { floor: 1, units: ['101', '102', '103', '104', '105', '106', '107', '108'] },
      { floor: 2, units: ['201', '202', '203', '204', '205', '206', '207', '208'] },
      { floor: 3, units: ['301', '302', '303', '304', '305', '306', '307', '308'] },
      { floor: 4, units: ['401', '402', '403', '404', '405', '406', '407', '408'] },
      { floor: 5, units: ['501', '502', '503', '504', '505', '506', '507', '508'] },
      { floor: 6, units: ['601', '602', '603', '604', '605', '606', '607', '608'] },
      { floor: 7, units: ['701', '702', '703', '704', '705', '706', '707', '708'] },
      { floor: 8, units: ['801', '802', '803', '804', '805', '806', '807', '808'] },
      { floor: 9, units: ['901', '902', '903', '904', '905', '906', '907', '908'] },
      { floor: 10, units: ['1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008'] },
      { floor: 11, units: ['1101', '1102', '1103', '1104', '1105', '1106', '1107', '1108'] },
      { floor: 12, units: ['1201', '1202', '1203', '1204', '1205', '1206', '1207', '1208'] },
      { floor: 13, units: ['1301', '1302', '1303', '1304', '1305', '1306', '1307', '1308'] },
      { floor: 14, units: ['1401', '1402', '1403', '1404', '1405', '1406', '1407', '1408'] },
      { floor: 15, units: ['1501', '1502', '1503', '1504', '1505', '1506', '1507', '1508'] },
      { floor: 16, units: ['1601', '1602', '1603', '1604', '1605', '1606', '1607', '1608'] },
      { floor: 17, units: ['1701', '1702', '1703', '1704', '1705', '1706', '1707', '1708'] },
      { floor: 18, units: ['1801', '1802', '1803', '1804', '1805', '1806', '1807', '1808'] },
      ],
    },
    ],
  },
  // CELEBRITY GARDENS — the next pilot society (founder call, 21 Sep).
  // Generated from Celebrity_Gardens_Lucknow_All_Towers.csv (13 towers, 4 flats
  // per floor, ground to 13th). The CSV carries no map location, so `coords`
  // is left out: the society is picked from the list and is never auto-selected
  // from a map pin until its coordinates are added here.
  {
    id: 'celebrity-gardens',
    name: 'Celebrity Gardens',
    city: LAUNCH_AREA.city,
    area: LAUNCH_AREA.area,
    pincode: LAUNCH_AREA.pincode,
    radiusKm: 0.6,
    towers: [
      {
        id: 'A',
        label: 'Tower A',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'B',
        label: 'Tower B',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'C',
        label: 'Tower C',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'D',
        label: 'Tower D',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'E',
        label: 'Tower E',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'J',
        label: 'Tower J',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'K',
        label: 'Tower K',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'L',
        label: 'Tower L',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'M',
        label: 'Tower M',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'N',
        label: 'Tower N',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'P',
        label: 'Tower P',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'Q',
        label: 'Tower Q',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
      {
        id: 'R',
        label: 'Tower R',
        floors: [
          { floor: 0, units: ['001', '002', '003', '004'] },
          { floor: 1, units: ['101', '102', '103', '104'] },
          { floor: 2, units: ['201', '202', '203', '204'] },
          { floor: 3, units: ['301', '302', '303', '304'] },
          { floor: 4, units: ['401', '402', '403', '404'] },
          { floor: 5, units: ['501', '502', '503', '504'] },
          { floor: 6, units: ['601', '602', '603', '604'] },
          { floor: 7, units: ['701', '702', '703', '704'] },
          { floor: 8, units: ['801', '802', '803', '804'] },
          { floor: 9, units: ['901', '902', '903', '904'] },
          { floor: 10, units: ['1001', '1002', '1003', '1004'] },
          { floor: 11, units: ['1101', '1102', '1103', '1104'] },
          { floor: 12, units: ['1201', '1202', '1203', '1204'] },
          { floor: 13, units: ['1301', '1302', '1303', '1304'] },
        ],
      },
    ],
  },
];

/** Great-circle distance in km (same formula as lib/serviceability). */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Is this point inside the launch township (where the society flow applies)? */
export function isInLaunchArea(c: { lat: number; lng: number } | null | undefined): boolean {
  if (!c) return false;
  return distanceKm(LAUNCH_AREA.lat, LAUNCH_AREA.lng, c.lat, c.lng) <= LAUNCH_AREA.radiusKm;
}

/** The society whose circle contains this point, nearest first. Null outside all. */
export function societyForCoords(c: { lat: number; lng: number } | null | undefined): Society | null {
  if (!c) return null;
  let best: { s: Society; d: number } | null = null;
  for (const s of SOCIETIES) {
    if (!s.coords) continue;
    const d = distanceKm(s.coords.lat, s.coords.lng, c.lat, c.lng);
    if (d <= s.radiusKm && (!best || d < best.d)) best = { s, d };
  }
  return best?.s ?? null;
}

export function societyById(id: string | null | undefined): Society | null {
  return SOCIETIES.find((s) => s.id === id) ?? null;
}

export function towerById(society: Society | null, towerId: string | null | undefined): SocietyTower | null {
  return society?.towers.find((t) => t.id === towerId) ?? null;
}

export function unitsOnFloor(society: Society | null, towerId: string | null | undefined, floor: number | null): string[] {
  if (floor == null) return [];
  return towerById(society, towerId)?.floors.find((f) => f.floor === floor)?.units ?? [];
}

/** 0 → "Ground", 1 → "1st floor", 12 → "12th floor". */
export function floorLabel(n: number): string {
  if (n === 0) return 'Ground floor';
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix} floor`;
}

/** Short form for chips and summaries: 0 → "G", 8 → "8". */
export function floorShort(n: number): string {
  return n === 0 ? 'G' : String(n);
}

// ── Address composition ──────────────────────────────────────────────────────
// The structured parts are saved on the address row in their own fields (see
// lib/api Address.society/tower/floor/unit) AND rendered into line1/line2, so
// a rider app that only reads the text lines still gets a complete door, while
// the operator console can group by tower + floor.

export type SocietyAddressParts = {
  societyId: string;
  societyName: string;
  tower: string;
  floor: number;
  unit: string;
};

/** The door itself, as short as a rider needs: "P4-805". */
export function societyLine1(p: SocietyAddressParts): string {
  return `${p.tower}-${p.unit}`;
}

/** The context line: "8th floor, Chandra Panorama, Sushant Golf City". */
export function societyLine2(p: SocietyAddressParts, area?: string | null): string {
  return [floorLabel(p.floor), p.societyName, area || null].filter(Boolean).join(', ');
}

/** One-line summary for confirmation chips: "P4 · 8th floor · 805". */
export function societySummary(p: SocietyAddressParts): string {
  return `${p.tower} · ${floorLabel(p.floor)} · ${p.unit}`;
}
