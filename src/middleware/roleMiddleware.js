function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: 'Usuario no autenticado'
            });
        }

        const userRole =
            String(req.user.role_code || '')
                .toLowerCase();

        const normalizedRoles =
            allowedRoles.map(role =>
                String(role).toLowerCase()
            );

        if (!normalizedRoles.includes(userRole)) {
            return res.status(403).json({
                message:
                    'No tienes permisos para realizar esta acción'
            });
        }

        next();
    };
}

module.exports = requireRoles;