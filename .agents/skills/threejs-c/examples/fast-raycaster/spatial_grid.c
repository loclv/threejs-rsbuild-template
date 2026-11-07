// Fast spatial bounding-box raycaster in C.
// Avoids JavaScript object allocation during pointermove events.

#define MAX_OBJECTS 10000

typedef struct {
    float min_x, min_y, min_z;
    float max_x, max_y, max_z;
    int id;
} BoundingBox;

static BoundingBox boxes[MAX_OBJECTS];
static int box_count = 0;

__attribute__((export_name("clear_boxes")))
void clear_boxes(void) {
    box_count = 0;
}

__attribute__((export_name("add_box")))
int add_box(float min_x, float min_y, float min_z, float max_x, float max_y, float max_z, int id) {
    if (box_count >= MAX_OBJECTS) return -1;
    boxes[box_count].min_x = min_x;
    boxes[box_count].min_y = min_y;
    boxes[box_count].min_z = min_z;
    boxes[box_count].max_x = max_x;
    boxes[box_count].max_y = max_y;
    boxes[box_count].max_z = max_z;
    boxes[box_count].id = id;
    box_count++;
    return box_count - 1;
}

// Result buffer: [hit_id, hit_distance]
static float hit_result[2];

__attribute__((export_name("get_hit_result")))
float* get_hit_result(void) {
    return hit_result;
}

// Ray-AABB intersection using slab method
__attribute__((export_name("query_ray")))
int query_ray(float ro_x, float ro_y, float ro_z, float rd_x, float rd_y, float rd_z) {
    float inv_dx = rd_x != 0.0f ? 1.0f / rd_x : 1e30f;
    float inv_dy = rd_y != 0.0f ? 1.0f / rd_y : 1e30f;
    float inv_dz = rd_z != 0.0f ? 1.0f / rd_z : 1e30f;

    float closest_t = 1e30f;
    int closest_id = -1;

    for (int i = 0; i < box_count; i++) {
        BoundingBox b = boxes[i];

        float t1 = (b.min_x - ro_x) * inv_dx;
        float t2 = (b.max_x - ro_x) * inv_dx;
        float tmin = t1 < t2 ? t1 : t2;
        float tmax = t1 > t2 ? t1 : t2;

        float t3 = (b.min_y - ro_y) * inv_dy;
        float t4 = (b.max_y - ro_y) * inv_dy;
        float ty_min = t3 < t4 ? t3 : t4;
        float ty_max = t3 > t4 ? t3 : t4;

        if (tmin > ty_max || ty_min > tmax) continue;
        if (ty_min > tmin) tmin = ty_min;
        if (ty_max < tmax) tmax = ty_max;

        float t5 = (b.min_z - ro_z) * inv_dz;
        float t6 = (b.max_z - ro_z) * inv_dz;
        float tz_min = t5 < t6 ? t5 : t6;
        float tz_max = t5 > t6 ? t5 : t6;

        if (tmin > tz_max || tz_min > tmax) continue;
        if (tz_min > tmin) tmin = tz_min;
        if (tz_max < tmax) tmax = tz_max;

        if (tmax >= 0.0f && tmin < closest_t) {
            closest_t = tmin > 0.0f ? tmin : 0.0f;
            closest_id = b.id;
        }
    }

    hit_result[0] = (float)closest_id;
    hit_result[1] = closest_t;
    return closest_id;
}
