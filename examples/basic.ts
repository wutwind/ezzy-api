import { Result } from '@praha/byethrow';
import { createApi, defineApi } from '@wutwind/ezzy-api';
import * as v from 'valibot';

const CourseSchema = v.object({
    id: v.string(),
    name: v.string(),
});

const CoursesSchema = v.array(CourseSchema);

const CreateCourseSchema = v.object({
    name: v.pipe(v.string(), v.minLength(3), v.maxLength(360)),
});

const CoursesQuerySchema = v.object({
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
});

const CourseParamsSchema = v.object({
    id: v.pipe(v.string(), v.uuid()),
});

const UpdateCourseSchema = v.object({
    name: v.optional(v.string()),
    description: v.optional(v.string()),
});

const apiDefinition = defineApi({
    getCourses: {
        method: 'GET',
        path: '/courses',
        query: CoursesQuerySchema,
        response: CoursesSchema,
    },

    getCourse: {
        method: 'GET',
        path: '/courses/:id',
        params: CourseParamsSchema,
        response: CourseSchema,
    },

    createCourse: {
        method: 'POST',
        path: '/courses',
        body: CreateCourseSchema,
        response: CourseSchema,
    },

    updateCourse: {
        method: 'PATCH',
        path: '/courses/:id',
        params: CourseParamsSchema,
        query: CoursesQuerySchema,
        body: UpdateCourseSchema,
        response: CourseSchema,
    },
});

const api = createApi(apiDefinition, { baseUrl: '/api' });

const coursesList = await api.getCourses({ query: { page: 1 } });

api.updateCourse({
    params: { id: '550e8400-e29b-41d4-a716-446655440000' },
});

api.getCourses({
    query: {
        page: 1,
        limit: 20,
    },
});

api.getCourse({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
});

api.createCourse({
    body: {
        name: 'foo',
    },
});

api.updateCourse({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
    query: {
        page: 1,
    },
    body: {
        name: 'foo',
    },
});

const courses = await api.getCourses();

if (Result.isSuccess(courses)) {
    courses.value satisfies Array<{
        id: string;
        name: string;
    }>;
}

const course = await api.getCourse({
    params: {
        id: '550e8400-e29b-41d4-a716-446655440000',
    },
});

if (Result.isSuccess(course)) {
    course.value satisfies {
        id: string;
        name: string;
    };
}
